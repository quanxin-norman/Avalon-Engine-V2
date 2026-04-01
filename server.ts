import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { encode } from '@toon-format/toon';
import { Role, Player, getQuestConfig, assignRoles } from './src/utils/gameLogic';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Resolve project root directory (works with both ESM and CJS)
// @ts-ignore - __dirname exists at runtime in tsx/CJS
const __projectDir = typeof __dirname !== 'undefined' ? __dirname : dirname(fileURLToPath(import.meta.url));

// Load role prompt files for AI bots
const ROLE_PROMPTS: Record<string, string> = {};
const ROLE_PROMPT_FILES: Record<string, string> = {
  'Merlin': 'merlin.md',
  'Percival': 'percival.md',
  'Loyal Servant': 'loyal_servant.md',
  'Morgana': 'morgana.md',
  'Assassin': 'assassin.md',
  'Mordred': 'mordred.md',
  'Oberon': 'oberon.md',
  'Minion': 'minion.md',
};
for (const [role, file] of Object.entries(ROLE_PROMPT_FILES)) {
  try {
    ROLE_PROMPTS[role] = readFileSync(join(__projectDir, 'server', 'prompts', file), 'utf-8');
  } catch {
    console.warn(`Warning: Could not load prompt for ${role} from server/prompts/${file}`);
    ROLE_PROMPTS[role] = `You are playing Avalon as ${role}. Play strategically.`;
  }
}

const PORT = 3000;

const DEFAULT_MODELS: Record<string, string> = {
  gemini: 'gemini-2.0-flash-lite',
  openrouter: 'google/gemini-2.0-flash-exp:free',
  groq: 'llama-3.3-70b-versatile',
  nvidia: 'meta/llama-3.3-70b-instruct',
};

// Initialize Supabase Admin Client
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

let supabase: any = null;
try {
  if (supabaseUrl && supabaseServiceKey) {
    supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }
} catch (err) {
  console.warn('Failed to initialize Supabase admin client:', err);
}

async function updatePlayerStats(userId: string, isWinner: boolean) {
  if (!userId || !supabase) return;

  try {
    // We use an RPC call if we had one, but for simplicity we'll do a select then update
    // In a production app with high concurrency, an RPC function in Postgres is safer
    const { data: profile, error: fetchError } = await supabase
      .from('profiles')
      .select('wins, losses, total_games')
      .eq('id', userId)
      .single();

    if (fetchError) {
      console.error('Error fetching profile for stats update:', fetchError);
      return;
    }

    if (profile) {
      const updates = {
        total_games: (profile.total_games || 0) + 1,
        wins: isWinner ? (profile.wins || 0) + 1 : profile.wins,
        losses: !isWinner ? (profile.losses || 0) + 1 : profile.losses,
      };

      const { error: updateError } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId);

      if (updateError) {
        console.error('Error updating profile stats:', updateError);
      }
    }
  } catch (err) {
    console.error('Failed to update player stats:', err);
  }
}

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
    },
  });

  // API routes FIRST
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/rooms', (req, res) => {
    const roomList = Object.values(rooms).map(room => ({
      id: room.id,
      hostName: room.players.find(p => p.isHost)?.name || 'Unknown',
      playerCount: room.players.length,
      maxPlayers: 10,
      status: room.status === 'lobby' ? 'waiting' : 'in_game',
    }));
    res.json(roomList);
  });

  // Socket.io logic
  setupSocket(io);

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

// --- Game Logic ---



interface Quest {
  teamSize: number;
  requiresTwoFails: boolean;
  status: 'pending' | 'success' | 'fail';
  team: string[]; // sessionIds
  votes: Record<string, boolean>; // sessionId -> success(true)/fail(false)
}

interface TeamVoteHistory {
  questIndex: number;
  voteTrack: number;
  leaderIndex: number;
  proposedTeam: string[];
  votes: Record<string, boolean>;
  approved: boolean;
}

type BotDifficulty = 'normal' | 'hard';

interface BotMemory {
  trustScores: Record<string, number>; // sessionId -> score (0-100)
  knownRoles: Record<string, Role | 'Good' | 'Evil'>; // sessionId -> known role/alignment
  merlinSuspicion: Record<string, number>; // sessionId -> score (0-100), used by evil
  failAssociation: Record<string, number>; // sessionId -> number of failed quests they were on
  votePatterns: Record<string, { approvedEvil: number; rejectedEvil: number; totalVotes: number }>;
  percivalCandidates?: { a: string; b: string; merlinLikelihood: Record<string, number> };
}

interface BotOpinion {
  botId: string;
  text: string;
  isError?: boolean;
}

interface MindLogEntry {
  phase: string;
  prompt: string;
  response: string;
  decision: string;
  timestamp: number;
}

interface Room {
  id: string;
  players: Player[];
  status: 'lobby' | 'role_reveal' | 'team_building' | 'team_voting' | 'team_vote_reveal' | 'quest_voting' | 'quest_result' | 'assassin' | 'game_over';
  settings: {
    optionalRoles: Role[];
    botDifficulty: BotDifficulty;
  };
  gameState: {
    quests: Quest[];
    currentQuestIndex: number;
    voteTrack: number; // 0-5
    leaderIndex: number;
    proposedTeam: string[]; // sessionIds
    teamVotes: Record<string, boolean>; // sessionId -> approve(true)/reject(false)
    winner: 'good' | 'evil' | null;
    assassinationTarget: string | null;
    voteHistory: TeamVoteHistory[];
    botMemories: Record<string, BotMemory>; // bot sessionId -> memory
    botOpinions?: BotOpinion[];
    botMindLogs: Record<string, MindLogEntry[]>; // AI bot sessionId -> mind log
    playerScores?: Record<string, number>;
    playerScoreDetails?: Record<string, {reason: string; delta: number}[]>;
  };
  lastActivityTime: number;
  idleWarningEmitted: boolean;
}

const IDLE_TIMEOUT_MS = 20 * 60 * 1000; // 20 minutes
const IDLE_WARNING_COUNTDOWN_S = 30; // 30 seconds after warning

function touchRoom(room: Room) {
  room.lastActivityTime = Date.now();
  room.idleWarningEmitted = false;
}

const rooms: Record<string, Room> = {};

// === SECURITY: Socket identity mapping ===
// Maps socket.id → sessionId so we never trust client-sent sessionId
const socketToSession: Record<string, string> = {};

// === SECURITY: Sanitize room data before broadcasting ===
// Strips other players' roles and botMemories, but respects Avalon's role visibility rules:
// - Merlin sees evil (except Mordred)
// - Percival sees Merlin and Morgana
// - Evil (except Oberon) sees fellow evil (except Oberon)
function sanitizeRoomForPlayer(room: Room, viewerSessionId: string): Room {
  // During game_over, reveal all roles and include AI mind logs
  if (room.status === 'game_over') {
    const { botMemories, ...safeGameState } = room.gameState as any;
    return { ...room, gameState: { ...safeGameState, botMindLogs: room.gameState.botMindLogs } };
  }

  const viewer = room.players.find(p => p.sessionId === viewerSessionId);
  const viewerRole = viewer?.role as string | null;
  const isViewerEvil = viewerRole ? ['Assassin', 'Morgana', 'Mordred', 'Minion'].includes(viewerRole) : false;

  const sanitizedPlayers = room.players.map(p => {
    // Always strip apiKey before sending to any client
    const { apiKey: _stripped, ...safeP } = p as any;

    if (safeP.sessionId === viewerSessionId) {
      return safeP; // Player always sees their own role
    }

    const targetRole = safeP.role as string | null;
    if (!targetRole) return { ...safeP, role: null };

    const isTargetEvil = ['Assassin', 'Morgana', 'Mordred', 'Minion', 'Oberon'].includes(targetRole);

    // Merlin sees all evil EXCEPT Mordred
    if (viewerRole === 'Merlin' && isTargetEvil && targetRole !== 'Mordred') {
      return safeP;
    }

    // Percival sees Merlin and Morgana (doesn't know which is which — UI only shows names)
    if (viewerRole === 'Percival' && (targetRole === 'Merlin' || targetRole === 'Morgana')) {
      return safeP;
    }

    // Evil (except Oberon) sees fellow evil (except Oberon)
    if (isViewerEvil && ['Assassin', 'Morgana', 'Mordred', 'Minion'].includes(targetRole)) {
      return safeP;
    }

    return { ...safeP, role: null }; // Hide role from this viewer
  });

  const { botMemories, botMindLogs, ...safeGameState } = room.gameState as any;
  return {
    ...room,
    players: sanitizedPlayers,
    gameState: safeGameState,
  };
}

// Broadcast a personalized, sanitized room update to each connected player
function broadcastRoom(room: Room, io: Server) {
  room.players.forEach(player => {
    if (player.id && !player.isBot) {
      const sanitized = sanitizeRoomForPlayer(room, player.sessionId);
      io.to(player.id).emit('room_update', sanitized);
    }
  });
}

async function callOpenAICompatible(
  baseUrl: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  const data = await response.json() as any;
  return data.choices?.[0]?.message?.content ?? '';
}

function triggerBotOpinions(room: Room, io: Server) {
  const botsWithKeys = room.players.filter(p => p.isBot && p.botClass === 'ai' && p.apiKey);
  if (botsWithKeys.length === 0) return;

  room.gameState.botOpinions ??= [];
  broadcastRoom(room, io);

  console.log('Triggering bot opinions...');
  botsWithKeys.forEach(async (bot) => {
    try {
      const isEvil = ['Assassin', 'Morgana', 'Mordred', 'Minion', 'Oberon'].includes(bot.role as string);

      const memory = room.gameState.botMemories[bot.sessionId];
      const leaderName = room.players[room.gameState.leaderIndex].name;

      let conditionalRoleInstructionClause: string | undefined;
      if (bot.role === 'Merlin') {
        conditionalRoleInstructionClause = `You need to protect your secret identity. Only comment on other players when you have strong evidence based on the quests and team vote history. Otherwise, say you don't have much information.`;
      } else if (bot.role === 'Percival') {
        conditionalRoleInstructionClause = `You need to protect Merlin's identity. Only comment on your Merlin candidates when you have strong evidence based on the quests and team vote history. Otherwise, comment on other players.

Your Merlin candidates:
${encode(mapPercivalCandidatesToNames(room, memory.percivalCandidates.merlinLikelihood))}`;
      } else if (isEvil) {
        conditionalRoleInstructionClause = `Form your opinion as if you are a good player. Rat out your evil teammate if necessary.`;
      }

      const prompt = `Provide a very short opinion about the game state, addressing the other players, based on the following information.

Your current trust of others (0 is completely distrust, 100 is completely trust):
${encode(mapTrustScoresToNames(room, memory.trustScores))}

Your known roles:
${encode(mapKnownRolesToNames(room, memory.knownRoles))}

Quest results:
${encode(getQuestResults(room))}

Team vote history:
${encode(getVoteHistory(room))}

The current leader forming the team is "${leaderName}".`;

      const rolePrompt = ROLE_PROMPTS[bot.role as string] || '';
      const systemInstruction = `${rolePrompt}

你正在以 "${bot.name}" 的身份发言，你的秘密角色是 ${bot.role}（${isEvil ? '邪恶阵营' : '好人阵营'}）。

发言要求:
- 以人类玩家的口吻发言。
- 简短随意（2-3句话）。
- 不要暴露你的秘密角色。
- 基于任务和投票历史分析，不要直接透露你的已知信息。
- 对当前队长提出建议。如果你不信任队长，可以直接说。
- 用中文回答，不要使用markdown格式。` + (conditionalRoleInstructionClause ? `

额外角色指导:
${conditionalRoleInstructionClause}` : '');

      const provider = bot.provider ?? 'gemini';
      const model = bot.model || DEFAULT_MODELS[provider] || DEFAULT_MODELS.gemini;

      let text: string;
      if (provider === 'gemini') {
        const genAI = new GoogleGenAI({ apiKey: bot.apiKey! });
        const response = await genAI.models.generateContent({
          model,
          contents: prompt,
          config: {
            systemInstruction,
            thinkingConfig: {
              // High thinking level for dynamic thinking and maximizing reasoning depth.
              // https://ai.google.dev/gemini-api/docs/gemini-3#thinking_level
              thinkingLevel: ThinkingLevel.HIGH,
            },
          },
        });
        text = response.text || '';
      } else {
        const BASE_URLS: Record<string, string> = {
          openrouter: 'https://openrouter.ai/api/v1',
          groq: 'https://api.groq.com/openai/v1',
          nvidia: 'https://integrate.api.nvidia.com/v1',
        };
        text = await callOpenAICompatible(BASE_URLS[provider], bot.apiKey!, model, systemInstruction, prompt);
      }

      console.log(`Opinion generated successfully for ${bot.name}.`);
      addMindLog(room, bot.sessionId, 'opinion', prompt, text, text.slice(0, 100));
      room.gameState.botOpinions.push({ botId: bot.sessionId, text });
      broadcastRoom(room, io);
    } catch (err: any) {
      const raw = err?.message || String(err);
      console.error(`Error generating opinion for ${bot.name}:`, raw);
      const httpMatch = raw.match(/HTTP (\d+)/);
      let userMsg: string;
      if (httpMatch) {
        const s = parseInt(httpMatch[1]);
        if (s === 401) userMsg = 'API error: Invalid API key (401)';
        else if (s === 403) userMsg = 'API error: Access denied (403)';
        else if (s === 404) userMsg = 'API error: Model not found (404)';
        else if (s === 429) userMsg = 'API error: Rate limited (429)';
        else userMsg = `API error: HTTP ${s}`;
      } else if (/timeout/i.test(raw)) {
        userMsg = 'API error: Connection timeout';
      } else {
        userMsg = 'API error: ' + raw.slice(0, 120);
      }
      room.gameState.botOpinions.push({ botId: bot.sessionId, text: userMsg, isError: true });
      broadcastRoom(room, io);
    }
  });
}

function mapTrustScoresToNames(room: Room, trustScores: Record<string, number>): {
  name: string,
  score: number,
}[] {
  return Object.entries(trustScores).map(([sessionId, score]) => ({
    name: room.players.find(p => p.sessionId === sessionId)!.name,
    score
  }));
}

function mapKnownRolesToNames(room: Room, knownRoles: Record<string, Role | "Evil" | "Good">): {
  name: string,
  role: Role | "Evil" | "Good",
}[] {
  return Object.entries(knownRoles).map(([sessionId, role]) => ({
    name: room.players.find(p => p.sessionId === sessionId)!.name,
    role
  }));
}

function getQuestResults(room: Room): {
  status: 'pending' | 'success' | 'fail',
  team: string[],
  failVotesCount: number,
}[] {
  return room.gameState.quests.map((q) => ({
    status: q.status,
    team: q.team.map(sessionId => room.players.find(p => p.sessionId === sessionId)!.name),
    failVotesCount: Object.values(q.votes).filter(v => !v).length
  }));
}

function getVoteHistory(room: Room): {
  questIndex: number;
  voteTrack: number;
  leader: string;
  proposedTeam: string[];
  votes: { name: string, approved: boolean }[];
  approved: boolean;
}[] {
  return room.gameState.voteHistory.map(v => ({
    questIndex: v.questIndex,
    voteTrack: v.voteTrack,
    leader: room.players[v.leaderIndex].name,
    proposedTeam: v.proposedTeam.map(sessionId => room.players.find(p => p.sessionId === sessionId)!.name),
    votes: Object.entries(v.votes).map(([sessionId, approved]) => ({
      name: room.players.find(p => p.sessionId === sessionId)!.name,
      approved
    })),
    approved: v.approved
  }));
}

function mapPercivalCandidatesToNames(room: Room, merlinLikelihood: Record<string, number>): {
  name: string,
  likelihood: number,
}[] {
  return Object.entries(merlinLikelihood).map(([sessionId, likelihood]) => ({
    name: room.players.find(p => p.sessionId === sessionId)!.name,
    likelihood
  }));
}

function initializeBotMemories(room: Room) {
  const difficulty = room.settings.botDifficulty || 'normal';

  room.players.filter(p => p.isBot).forEach(bot => {
    const memory: BotMemory = {
      trustScores: {},
      knownRoles: {},
      merlinSuspicion: {},
      failAssociation: {},
      votePatterns: {}
    };

    const isBotEvil = ['Assassin', 'Morgana', 'Mordred', 'Minion', 'Oberon'].includes(bot.role as string);
    let merlinCandidateA: string | null = null;
    let merlinCandidateB: string | null = null;

    room.players.forEach(p => {
      memory.failAssociation[p.sessionId] = 0;
      memory.votePatterns[p.sessionId] = { approvedEvil: 0, rejectedEvil: 0, totalVotes: 0 };

      if (isBotEvil) {
        memory.merlinSuspicion[p.sessionId] = 0;
      }

      if (p.sessionId === bot.sessionId) {
        memory.trustScores[p.sessionId] = 100; // Trust self completely
        memory.knownRoles[p.sessionId] = bot.role as Role;
        return;
      }

      // Default trust is 50. In hard mode, good bots start a bit more neutral, evil bots distrust good more.
      memory.trustScores[p.sessionId] = difficulty === 'hard' ? 40 : 50;

      const botRole = bot.role as Role;
      const targetRole = p.role as Role;
      const isTargetEvil = ['Assassin', 'Morgana', 'Mordred', 'Minion', 'Oberon'].includes(targetRole);

      if (botRole === 'Merlin') {
        // Merlin knows all evil except Mordred
        if (isTargetEvil && targetRole !== 'Mordred') {
          memory.trustScores[p.sessionId] = 0;
          memory.knownRoles[p.sessionId] = 'Evil';
        } else {
          memory.trustScores[p.sessionId] = difficulty === 'hard' ? 60 : 70; // Lean towards trusting others
        }
      } else if (botRole === 'Percival') {
        // Percival knows Merlin and Morgana but not which is which
        if (targetRole === 'Merlin' || targetRole === 'Morgana') {
          memory.trustScores[p.sessionId] = difficulty === 'hard' ? 50 : 60;

          if (!merlinCandidateA) merlinCandidateA = p.sessionId;
          else if (!merlinCandidateB) merlinCandidateB = p.sessionId;
        }
      } else if (isBotEvil && botRole !== 'Oberon') {
        // Evil knows other evil (except Oberon)
        if (isTargetEvil && targetRole !== 'Oberon') {
          memory.trustScores[p.sessionId] = 100;
          memory.knownRoles[p.sessionId] = 'Evil';
        } else {
          memory.trustScores[p.sessionId] = 0; // Distrust all good players
          memory.knownRoles[p.sessionId] = 'Good';
        }
      }
    });

    if (bot.role === 'Percival' && merlinCandidateA && merlinCandidateB) {
      memory.percivalCandidates = {
        a: merlinCandidateA,
        b: merlinCandidateB,
        merlinLikelihood: {
          [merlinCandidateA]: 50,
          [merlinCandidateB]: 50
        }
      };
    }

    room.gameState.botMemories[bot.sessionId] = memory;
  });
}

function checkTeamVotes(room: Room, io: Server) {
  if (Object.keys(room.gameState.teamVotes).length === room.players.length) {
    const approves = Object.values(room.gameState.teamVotes).filter(v => v).length;
    const rejects = room.players.length - approves;
    const approved = approves > rejects;

    room.gameState.voteHistory.push({
      questIndex: room.gameState.currentQuestIndex,
      voteTrack: room.gameState.voteTrack,
      leaderIndex: room.gameState.leaderIndex,
      proposedTeam: [...room.gameState.proposedTeam],
      votes: { ...room.gameState.teamVotes },
      approved
    });

    // --- Improvement A: Vote History Analysis ---
    // Good bots learn who approves/rejects teams with evil. Evil bots learn who acts like Merlin.
    const difficulty = room.settings.botDifficulty || 'normal';
    const trustDelta = difficulty === 'hard' ? 15 : 5;
    const suspicionDelta = difficulty === 'hard' ? 15 : 5;

    room.players.filter(p => p.isBot).forEach(bot => {
      const memory = room.gameState.botMemories[bot.sessionId];
      const isBotEvil = ['Assassin', 'Morgana', 'Mordred', 'Minion', 'Oberon'].includes(bot.role as string);

      const teamHadKnownEvil = room.gameState.proposedTeam.some(id => memory.knownRoles[id] === 'Evil' || (isBotEvil && id === bot.sessionId));

      room.players.forEach(p => {
        if (p.sessionId === bot.sessionId) return;

        const votedApprove = room.gameState.teamVotes[p.sessionId];

        // Update general vote patterns
        if (teamHadKnownEvil) {
          if (votedApprove) memory.votePatterns[p.sessionId].approvedEvil++;
          else memory.votePatterns[p.sessionId].rejectedEvil++;
        }
        memory.votePatterns[p.sessionId].totalVotes++;

        if (!isBotEvil) {
          // Good Bot Logic: Adjust trust based on voting for evil-tainted teams
          if (teamHadKnownEvil) {
            if (votedApprove) {
              memory.trustScores[p.sessionId] = Math.max(0, (memory.trustScores[p.sessionId] || 50) - trustDelta);
            } else {
              memory.trustScores[p.sessionId] = Math.min(100, (memory.trustScores[p.sessionId] || 50) + trustDelta);
            }
          }
          // Note: We used to penalize players for rejecting teams with no known evil. 
          // This was removed because blind Good bots were penalizing Merlin for dodging hidden evil.
        } else {
          // Evil Bot Logic: Track who is acting like Merlin (rejecting evil teams, approving good teams)
          if (memory.knownRoles[p.sessionId] !== 'Evil') {
            if (teamHadKnownEvil && !votedApprove) {
              // Good player rejected a team with evil -> acts like Merlin
              memory.merlinSuspicion[p.sessionId] = Math.min(100, (memory.merlinSuspicion[p.sessionId] || 0) + suspicionDelta);
            } else if (!teamHadKnownEvil && votedApprove) {
              // Good player approved an all-good team -> acts like Merlin
              memory.merlinSuspicion[p.sessionId] = Math.min(100, (memory.merlinSuspicion[p.sessionId] || 0) + (suspicionDelta / 2));
            } else if (teamHadKnownEvil && votedApprove) {
              // Good player approved team with evil -> less likely Merlin
              memory.merlinSuspicion[p.sessionId] = Math.max(0, (memory.merlinSuspicion[p.sessionId] || 0) - suspicionDelta);
            }
          }
        }

        // Percival Deduction Update
        if (bot.role === 'Percival' && memory.percivalCandidates) {
          const { a, b, merlinLikelihood } = memory.percivalCandidates;
          if (p.sessionId === a || p.sessionId === b) {
            // Percival expects Merlin to reject teams with evil
            if (teamHadKnownEvil && !votedApprove) {
              merlinLikelihood[p.sessionId] = Math.min(100, merlinLikelihood[p.sessionId] + suspicionDelta);
              memory.trustScores[p.sessionId] = Math.min(100, (memory.trustScores[p.sessionId] || 50) + trustDelta);

              // The other candidate is less likely Merlin
              const other = p.sessionId === a ? b : a;
              merlinLikelihood[other] = Math.max(0, merlinLikelihood[other] - suspicionDelta);
              memory.trustScores[other] = Math.max(0, (memory.trustScores[other] || 50) - trustDelta);
            }
          }
        }

      });
    });

    room.status = 'team_vote_reveal';
    broadcastRoom(room, io);
    handleBotActions(room, io);
  } else {
    // Just update that someone voted
    broadcastRoom(room, io);
  }
}

function applyTeamVoteResult(room: Room, io: Server) {
  const lastVote = room.gameState.voteHistory[room.gameState.voteHistory.length - 1];
  if (lastVote.approved) {
    // Team approved
    room.status = 'quest_voting';
    room.gameState.quests[room.gameState.currentQuestIndex].team = room.gameState.proposedTeam;
    room.gameState.voteTrack = 0;
  } else {
    // Team rejected
    room.gameState.voteTrack++;
    if (room.gameState.voteTrack >= 5) {
      room.status = 'game_over';
      room.gameState.winner = 'evil';
      recordGameStats(room);
    } else {
      room.status = 'team_building';
      room.gameState.leaderIndex = (room.gameState.leaderIndex + 1) % room.players.length;
      room.gameState.proposedTeam = [];
      triggerBotOpinions(room, io);
    }
  }
  broadcastRoom(room, io);
  handleBotActions(room, io);
}
function calculatePlayerScores(room: Room) {
  const scores: Record<string, number> = {};
  const details: Record<string, {reason: string; delta: number}[]> = {};
  
  room.players.forEach(p => {
    scores[p.sessionId] = 6;
    details[p.sessionId] = [{ reason: 'Base Score', delta: 6 }];
  });

  room.gameState.quests.forEach((quest, index) => {
    if (quest.status !== 'pending') {
      const approvedTeam = room.gameState.voteHistory.find(v => v.questIndex === index && v.approved);
      if (approvedTeam) {
        const leader = room.players[approvedTeam.leaderIndex];
        if (leader) {
          const isLeaderEvil = ['Assassin', 'Morgana', 'Mordred', 'Minion', 'Oberon'].includes(leader.role as string);
          if (!isLeaderEvil) {
            approvedTeam.proposedTeam.forEach(memberId => {
              const member = room.players.find(p => p.sessionId === memberId);
              if (member) {
                const isMemberEvil = ['Assassin', 'Morgana', 'Mordred', 'Minion', 'Oberon'].includes(member.role as string);
                if (isMemberEvil) {
                  if (leader.role === 'Merlin') {
                    scores[leader.sessionId] -= 2;
                    details[leader.sessionId].push({ reason: 'Merlin Brought Evil', delta: -2 });
                  } else if (leader.role === 'Percival') {
                    const delta = member.role === 'Morgana' ? -1 : -2;
                    scores[leader.sessionId] += delta;
                    const reason = member.role === 'Morgana' ? 'Percival Brought Morgana' : 'Percival Brought Evil';
                    details[leader.sessionId].push({ reason, delta });
                  } else {
                    scores[leader.sessionId] -= 1;
                    details[leader.sessionId].push({ reason: 'Good Proposer Brought Evil', delta: -1 });
                  }
                }
              }
            });
          }
        }
      }
    }

    if (quest.status === 'success') {
      room.players.forEach(p => {
        const isEvil = ['Assassin', 'Morgana', 'Mordred', 'Minion', 'Oberon'].includes(p.role as string);
        const delta = isEvil ? -1 : 1;
        scores[p.sessionId] += delta;
        details[p.sessionId].push({ reason: `Quest ${index + 1} Success`, delta });
      });
    } else if (quest.status === 'fail') {
      const approvedVote = room.gameState.voteHistory.filter(v => v.questIndex === index && v.approved).pop();
      if (approvedVote) {
        room.players.forEach(p => {
          if (!quest.team.includes(p.sessionId)) {
            const isEvil = ['Assassin', 'Morgana', 'Mordred', 'Minion', 'Oberon'].includes(p.role as string);
            if (isEvil) {
              scores[p.sessionId] += 1;
              details[p.sessionId].push({ reason: `Quest ${index + 1} Fail (Off Team)`, delta: 1 });
            } else {
              const votedApprove = approvedVote.votes[p.sessionId];
              if (votedApprove) {
                scores[p.sessionId] -= 1;
                details[p.sessionId].push({ reason: `Quest ${index + 1} Fail (Approved)`, delta: -1 });
              } else {
                scores[p.sessionId] += 1;
                details[p.sessionId].push({ reason: `Quest ${index + 1} Fail (Rejected)`, delta: 1 });
              }
            }
          }
        });
      }
    }
  });

  const successes = room.gameState.quests.filter(q => q.status === 'success').length;
  let assassinKilledMerlin = false;
  
  if (successes >= 3 && room.gameState.winner === 'evil' && room.gameState.assassinationTarget) {
     const targetPlayer = room.players.find(p => p.sessionId === room.gameState.assassinationTarget);
     if (targetPlayer && targetPlayer.role === 'Merlin') {
         assassinKilledMerlin = true;
     }
  }

  if (assassinKilledMerlin) {
    room.players.forEach(p => {
      const isEvil = ['Assassin', 'Morgana', 'Mordred', 'Minion', 'Oberon'].includes(p.role as string);
      if (!isEvil) {
        scores[p.sessionId] -= 3;
        details[p.sessionId].push({ reason: `Merlin Assassinated`, delta: -3 });
      }
      if (p.role === 'Assassin') {
        scores[p.sessionId] += 3;
        details[p.sessionId].push({ reason: `Assassinated Merlin`, delta: 3 });
      }
    });
  }

  if (room.gameState.winner) {
    const winner = room.gameState.winner;
    room.players.forEach(p => {
      const isEvil = ['Assassin', 'Morgana', 'Mordred', 'Minion', 'Oberon'].includes(p.role as string);
      if ((winner === 'evil' && isEvil) || (winner === 'good' && !isEvil)) {
        scores[p.sessionId] += 1;
        details[p.sessionId].push({ reason: `Faction Win`, delta: 1 });
      } else {
        scores[p.sessionId] -= 1;
        details[p.sessionId].push({ reason: `Faction Loss`, delta: -1 });
      }
    });
  }

  const scoreCounts: Record<number, number> = {};
  room.players.forEach(p => {
    scoreCounts[scores[p.sessionId]] = (scoreCounts[scores[p.sessionId]] || 0) + 1;
  });

  room.players.forEach(p => {
    const isEvil = ['Assassin', 'Morgana', 'Mordred', 'Minion', 'Oberon'].includes(p.role as string);
    const isWinner = (room.gameState.winner === 'evil' && isEvil) || (room.gameState.winner === 'good' && !isEvil);
    
    // Tie-breaker
    if (scoreCounts[scores[p.sessionId]] > 1 && isWinner) {
      scores[p.sessionId] += 1;
      details[p.sessionId].push({ reason: `Tie-breaker Win Bonus`, delta: 1 });
    }
  });

  room.players.forEach(p => {
    if (scores[p.sessionId] > 10) {
      const penalty = 10 - scores[p.sessionId];
      scores[p.sessionId] = 10;
      details[p.sessionId].push({ reason: `Score Max Cap`, delta: penalty });
    }
    if (scores[p.sessionId] < 0) {
      const bonus = 0 - scores[p.sessionId];
      scores[p.sessionId] = 0;
      details[p.sessionId].push({ reason: `Score Min Cap`, delta: bonus });
    }
  });

  room.gameState.playerScores = scores;
  room.gameState.playerScoreDetails = details;
}

function recordGameStats(room: Room) {
  if (!room.gameState.winner) return;

  calculatePlayerScores(room);

  room.players.forEach(player => {
    if (player.isBot || !player.userId) return;

    const isEvil = ['Assassin', 'Morgana', 'Mordred', 'Minion', 'Oberon'].includes(player.role as string);
    const isWinner = (room.gameState.winner === 'evil' && isEvil) || (room.gameState.winner === 'good' && !isEvil);

    updatePlayerStats(player.userId, isWinner);
  });
}

function checkQuestVotes(room: Room, io: Server) {
  const quest = room.gameState.quests[room.gameState.currentQuestIndex];
  if (Object.keys(quest.votes).length === quest.teamSize) {
    const fails = Object.values(quest.votes).filter(v => !v).length;
    const failed = quest.requiresTwoFails ? fails >= 2 : fails >= 1;

    quest.status = failed ? 'fail' : 'success';

    // Update bot memories based on quest result
    const difficulty = room.settings.botDifficulty || 'normal';

    // Track fail association for everyone on the team
    if (failed) {
      quest.team.forEach(memberId => {
        room.players.filter(p => p.isBot).forEach(bot => {
          const memory = room.gameState.botMemories[bot.sessionId];
          memory.failAssociation[memberId]++;
        });
      });
    }

    room.players.filter(p => p.isBot).forEach(bot => {
      const memory = room.gameState.botMemories[bot.sessionId];
      const isBotEvil = ['Assassin', 'Morgana', 'Mordred', 'Minion', 'Oberon'].includes(bot.role as string);

      if (!isBotEvil) {
        // Good bots learn from quest results
        quest.team.forEach(memberId => {
          if (memberId !== bot.sessionId) {
            if (failed) {
              // If quest failed, trust in team members drops significantly
              // If it's a 2-person team and I'm on it, the other person MUST be evil
              if (quest.teamSize === 2 && quest.team.includes(bot.sessionId)) {
                memory.trustScores[memberId] = 0;
                memory.knownRoles[memberId] = 'Evil';
              } else {
                const drop = difficulty === 'hard' ? 40 : 30;
                memory.trustScores[memberId] = Math.max(0, (memory.trustScores[memberId] || 50) - drop);
              }
            } else {
              // If quest succeeded, trust in team members increases slightly
              const boost = difficulty === 'hard' ? 20 : 15;
              memory.trustScores[memberId] = Math.min(100, (memory.trustScores[memberId] || 50) + boost);
            }
          }
        });

        // Good bots ALSO learn from who approved a doomed team vs who rejected it
        const lastVote = room.gameState.voteHistory[room.gameState.voteHistory.length - 1];
        if (lastVote) {
          room.players.forEach(p => {
            if (p.sessionId !== bot.sessionId && !quest.team.includes(p.sessionId)) {
              // Focus on people NOT on the team (we already handled team members above)
              const votedApprove = lastVote.votes[p.sessionId];
              if (failed) {
                // Quest failed. Approvers are suspicious, Rejecters look good (like Merlin).
                if (votedApprove) {
                  memory.trustScores[p.sessionId] = Math.max(0, (memory.trustScores[p.sessionId] || 50) - 15);
                } else {
                  memory.trustScores[p.sessionId] = Math.min(100, (memory.trustScores[p.sessionId] || 50) + 15);
                }
              } else {
                // Quest succeeded. Approvers look good. 
                if (votedApprove) {
                  memory.trustScores[p.sessionId] = Math.min(100, (memory.trustScores[p.sessionId] || 50) + 10);
                }
              }
            }
          });
        }

        // Percival deduction on quest ends
        if (bot.role === 'Percival' && memory.percivalCandidates) {
          const { a, b, merlinLikelihood } = memory.percivalCandidates;

          const shift = difficulty === 'hard' ? 40 : 20;

          // 1. Evaluate the Proposer of the Quest
          const leaderId = room.gameState.voteHistory[room.gameState.voteHistory.length - 1]?.leaderIndex;
          if (leaderId !== undefined) {
            const proposer = room.players[leaderId].sessionId;
            if (proposer === a || proposer === b) {
              const other = proposer === a ? b : a;
              if (failed) {
                // A candidate proposed a failing team. They are almost certainly Morgana.
                merlinLikelihood[proposer] = 0;
                merlinLikelihood[other] = 100;
                memory.trustScores[proposer] = 0;
                memory.trustScores[other] = 100;
              } else if (difficulty === 'hard') {
                // A candidate proposed a succeeding team. Slightly more likely to be Merlin.
                merlinLikelihood[proposer] = Math.min(100, merlinLikelihood[proposer] + 15);
                merlinLikelihood[other] = Math.max(0, merlinLikelihood[other] - 15);
              }
            }
          }

          // 2. Evaluate Candidate Votes on the Final Team
          if (lastVote) {
            const aApproved = lastVote.votes[a];
            const bApproved = lastVote.votes[b];

            if (aApproved !== bApproved) {
              const approver = aApproved ? a : b;
              const rejecter = aApproved ? b : a;

              if (failed) {
                // Approver of a doomed team is likely Morgana. Rejecter is Merlin.
                merlinLikelihood[approver] = Math.max(0, merlinLikelihood[approver] - shift);
                merlinLikelihood[rejecter] = Math.min(100, merlinLikelihood[rejecter] + shift);
                memory.trustScores[approver] = Math.max(0, (memory.trustScores[approver] || 50) - shift);
                memory.trustScores[rejecter] = Math.min(100, (memory.trustScores[rejecter] || 50) + shift);
              } else if (difficulty === 'hard') {
                // If it succeeded, approver is slightly more likely Merlin
                merlinLikelihood[approver] = Math.min(100, merlinLikelihood[approver] + 10);
                merlinLikelihood[rejecter] = Math.max(0, merlinLikelihood[rejecter] - 10);
              }
            }
          }

          // 3. Evaluate Team Participation
          const aOnTeam = quest.team.includes(a);
          const bOnTeam = quest.team.includes(b);

          if (aOnTeam !== bOnTeam) {
            const candidate = aOnTeam ? a : b;
            const other = aOnTeam ? b : a;

            if (failed) {
              // Participant on failed team is likely Morgana
              merlinLikelihood[candidate] = Math.max(0, merlinLikelihood[candidate] - shift);
              merlinLikelihood[other] = Math.min(100, merlinLikelihood[other] + shift);

              memory.trustScores[candidate] = Math.max(0, (memory.trustScores[candidate] || 50) - shift);
              memory.trustScores[other] = Math.min(100, (memory.trustScores[other] || 50) + shift);
            } else if (difficulty === 'hard') {
              // Participant on succeeding team is somewhat more likely Merlin
              merlinLikelihood[candidate] = Math.min(100, merlinLikelihood[candidate] + 10);
              merlinLikelihood[other] = Math.max(0, merlinLikelihood[other] - 10);
            }
          }
        }
      } else {
        // Evil bots learn who acts like Merlin
        // If a good player rejected a team that had evil on it and the quest FAILED, 
        // they were right, and thus more likely Merlin.
        if (failed) {
          const lastVote = room.gameState.voteHistory[room.gameState.voteHistory.length - 1];
          if (lastVote) {
            room.players.forEach(p => {
              if (memory.knownRoles[p.sessionId] !== 'Evil' && lastVote.votes[p.sessionId] === false) {
                const suspicionBoost = difficulty === 'hard' ? 20 : 10;
                memory.merlinSuspicion[p.sessionId] = Math.min(100, (memory.merlinSuspicion[p.sessionId] || 0) + suspicionBoost);
              }
            });
          }
        }
      }
    });

    // Enter quest_result phase to show result before advancing
    room.status = 'quest_result';
    broadcastRoom(room, io);
    handleBotActions(room, io);
  } else {
    broadcastRoom(room, io);
  }
}

// Advance from quest_result to the next phase
function applyQuestResult(room: Room, io: Server) {
  const successes = room.gameState.quests.filter(q => q.status === 'success').length;
  const totalFails = room.gameState.quests.filter(q => q.status === 'fail').length;

  if (successes >= 3) {
    room.status = 'assassin';
  } else if (totalFails >= 3) {
    room.status = 'game_over';
    room.gameState.winner = 'evil';
    recordGameStats(room);
  } else {
    room.gameState.currentQuestIndex++;
    room.status = 'team_building';
    room.gameState.leaderIndex = (room.gameState.leaderIndex + 1) % room.players.length;
    room.gameState.proposedTeam = [];
    room.gameState.teamVotes = {};
    triggerBotOpinions(room, io);
  }
  broadcastRoom(room, io);
  handleBotActions(room, io);
}

// === AI Bot LLM Decision Functions ===

function buildAIGameContext(room: Room, bot: Player): string {
  const memory = room.gameState.botMemories[bot.sessionId];
  const isEvil = ['Assassin', 'Morgana', 'Mordred', 'Minion', 'Oberon'].includes(bot.role as string);

  let context = `你是 "${bot.name}"，你的秘密角色是 ${bot.role}（${isEvil ? '邪恶阵营' : '好人阵营'}）。\n\n`;

  // Role-specific knowledge
  if (bot.role === 'Merlin') {
    const evilPlayers = room.players.filter(p => {
      const r = p.role as string;
      return ['Assassin', 'Morgana', 'Minion', 'Oberon'].includes(r); // Merlin can't see Mordred
    });
    context += `你能看到的坏人: ${evilPlayers.map(p => p.name).join(', ') || '无'}\n`;
  } else if (bot.role === 'Percival' && memory.percivalCandidates) {
    const nameA = room.players.find(p => p.sessionId === memory.percivalCandidates!.a)?.name;
    const nameB = room.players.find(p => p.sessionId === memory.percivalCandidates!.b)?.name;
    context += `你的拇指牌（梅林或莫甘娜）: ${nameA}, ${nameB}\n`;
  } else if (isEvil && bot.role !== 'Oberon') {
    const evilTeammates = room.players.filter(p =>
      p.sessionId !== bot.sessionId &&
      ['Assassin', 'Morgana', 'Mordred', 'Minion'].includes(p.role as string)
    );
    context += `你的邪恶队友: ${evilTeammates.map(p => p.name).join(', ') || '无'}\n`;
  }

  // Player list
  context += `\n所有玩家: ${room.players.map(p => p.name).join(', ')}\n`;

  // Quest results
  const questResults = room.gameState.quests.map((q, i) => {
    if (q.status === 'pending') return `任务${i + 1}: 未开始`;
    const teamNames = q.team.map(id => room.players.find(p => p.sessionId === id)?.name).join(', ');
    const fails = Object.values(q.votes).filter(v => !v).length;
    return `任务${i + 1}: ${q.status === 'success' ? '成功' : `失败(${fails}张失败票)`} 队伍:[${teamNames}]`;
  }).join('\n');
  context += `\n任务结果:\n${questResults}\n`;

  // Vote history
  if (room.gameState.voteHistory.length > 0) {
    const recentVotes = room.gameState.voteHistory.slice(-5).map(h => {
      const leaderName = room.players[h.leaderIndex]?.name;
      const teamNames = h.proposedTeam.map(id => room.players.find(p => p.sessionId === id)?.name).join(', ');
      const voteDetails = Object.entries(h.votes).map(([sid, approved]) => {
        const name = room.players.find(p => p.sessionId === sid)?.name;
        return `${name}:${approved ? '赞成' : '反对'}`;
      }).join(', ');
      return `任务${h.questIndex + 1} 第${h.voteTrack + 1}次投票 队长:${leaderName} 队伍:[${teamNames}] ${h.approved ? '通过' : '否决'} 投票:${voteDetails}`;
    }).join('\n');
    context += `\n最近投票历史:\n${recentVotes}\n`;
  }

  context += `\n当前任务: 第${room.gameState.currentQuestIndex + 1}个任务\n`;
  context += `投票失败次数: ${room.gameState.voteTrack}/5\n`;

  return context;
}

async function callAIForDecision(bot: Player, systemPrompt: string, userPrompt: string): Promise<string> {
  const provider = bot.provider ?? 'gemini';
  const model = bot.model || DEFAULT_MODELS[provider] || DEFAULT_MODELS.gemini;

  if (provider === 'gemini') {
    const genAI = new GoogleGenAI({ apiKey: bot.apiKey! });
    const response = await genAI.models.generateContent({
      model,
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
      },
    });
    return response.text || '';
  } else {
    const BASE_URLS: Record<string, string> = {
      openrouter: 'https://openrouter.ai/api/v1',
      groq: 'https://api.groq.com/openai/v1',
      nvidia: 'https://integrate.api.nvidia.com/v1',
    };
    return await callOpenAICompatible(BASE_URLS[provider], bot.apiKey!, model, systemPrompt, userPrompt);
  }
}

function addMindLog(room: Room, botId: string, phase: string, prompt: string, response: string, decision: string) {
  if (!room.gameState.botMindLogs[botId]) room.gameState.botMindLogs[botId] = [];
  room.gameState.botMindLogs[botId].push({ phase, prompt, response, decision, timestamp: Date.now() });
}

async function aiTeamBuilding(room: Room, bot: Player, teamSize: number, io: Server): Promise<string[]> {
  const rolePrompt = ROLE_PROMPTS[bot.role as string] || '';
  const gameContext = buildAIGameContext(room, bot);
  const playerNames = room.players.map(p => p.name);

  const userPrompt = `${gameContext}

你现在是队长，需要选择 ${teamSize} 名队员组队执行任务。

可选队员: ${playerNames.join(', ')}

请根据你的角色策略和当前局势选择队伍。

请严格按以下格式回答（不要加任何其他内容）:
思考: [你的分析，1-3句话]
队伍: [用逗号分隔的玩家名字]`;

  try {
    const response = await callAIForDecision(bot, rolePrompt, userPrompt);
    addMindLog(room, bot.sessionId, 'team_building', userPrompt, response, '');

    // Parse team from response
    const teamMatch = response.match(/队伍[:：]\s*(.+)/);
    if (teamMatch) {
      const names = teamMatch[1].split(/[,，、]/).map(n => n.trim()).filter(Boolean);
      const team: string[] = [];
      for (const name of names) {
        const player = room.players.find(p => p.name === name);
        if (player && !team.includes(player.sessionId)) {
          team.push(player.sessionId);
        }
        if (team.length >= teamSize) break;
      }

      // Fill remaining slots if AI didn't pick enough
      if (team.length < teamSize) {
        // Always include self
        if (!team.includes(bot.sessionId)) team.push(bot.sessionId);
        const remaining = room.players.filter(p => !team.includes(p.sessionId));
        while (team.length < teamSize && remaining.length > 0) {
          team.push(remaining.shift()!.sessionId);
        }
      }

      // Update mind log with final decision
      const lastLog = room.gameState.botMindLogs[bot.sessionId];
      if (lastLog.length > 0) lastLog[lastLog.length - 1].decision = `Team: ${team.map(id => room.players.find(p => p.sessionId === id)?.name).join(', ')}`;

      return team.slice(0, teamSize);
    }
  } catch (err: any) {
    console.error(`AI team building error for ${bot.name}:`, err?.message || err);
    addMindLog(room, bot.sessionId, 'team_building', userPrompt, `Error: ${err?.message || err}`, 'fallback');
  }

  // Fallback: include self + random others
  const team = [bot.sessionId];
  const others = room.players.filter(p => p.sessionId !== bot.sessionId).sort(() => Math.random() - 0.5);
  while (team.length < teamSize && others.length > 0) {
    team.push(others.shift()!.sessionId);
  }
  return team;
}

async function aiTeamVote(room: Room, bot: Player): Promise<boolean> {
  const rolePrompt = ROLE_PROMPTS[bot.role as string] || '';
  const gameContext = buildAIGameContext(room, bot);
  const leaderName = room.players[room.gameState.leaderIndex]?.name;
  const teamNames = room.gameState.proposedTeam.map(id => room.players.find(p => p.sessionId === id)?.name).join(', ');

  const userPrompt = `${gameContext}

队长 ${leaderName} 提议了以下队伍: [${teamNames}]
这是第 ${room.gameState.voteTrack + 1}/5 次投票。${room.gameState.voteTrack === 4 ? '（注意：如果这次否决，邪恶阵营将直接获胜！）' : ''}

请根据你的角色策略决定是否赞成这个队伍。

请严格按以下格式回答:
思考: [你的分析，1-3句话]
投票: 赞成 或 反对`;

  try {
    const response = await callAIForDecision(bot, rolePrompt, userPrompt);
    const approve = response.includes('赞成') && !response.match(/投票[:：]\s*反对/);
    const voteDecision = response.match(/投票[:：]\s*(赞成|反对)/);
    const finalApprove = voteDecision ? voteDecision[1] === '赞成' : approve;

    addMindLog(room, bot.sessionId, 'team_vote', userPrompt, response, finalApprove ? '赞成' : '反对');
    return finalApprove;
  } catch (err: any) {
    console.error(`AI team vote error for ${bot.name}:`, err?.message || err);
    addMindLog(room, bot.sessionId, 'team_vote', userPrompt, `Error: ${err?.message || err}`, 'fallback: approve');

    // Fallback: approve on last vote, otherwise 50/50
    return room.gameState.voteTrack === 4 || Math.random() > 0.5;
  }
}

async function aiQuestVote(room: Room, bot: Player): Promise<boolean> {
  const rolePrompt = ROLE_PROMPTS[bot.role as string] || '';
  const gameContext = buildAIGameContext(room, bot);
  const isEvil = ['Assassin', 'Morgana', 'Mordred', 'Minion', 'Oberon'].includes(bot.role as string);
  const currentQuest = room.gameState.quests[room.gameState.currentQuestIndex];
  const teamNames = room.gameState.proposedTeam.map(id => room.players.find(p => p.sessionId === id)?.name).join(', ');

  const userPrompt = `${gameContext}

你在任务队伍中: [${teamNames}]
${currentQuest.requiresTwoFails ? '（这个任务需要2张失败票才会失败）' : ''}

你必须选择: 成功 或 失败
${isEvil ? '作为邪恶阵营，你可以选择投失败来破坏任务，也可以投成功来隐藏身份。' : '作为好人阵营，你应该投成功。'}

请严格按以下格式回答:
思考: [你的分析，1-3句话]
任务投票: 成功 或 失败`;

  try {
    const response = await callAIForDecision(bot, rolePrompt, userPrompt);
    const voteMatch = response.match(/任务投票[:：]\s*(成功|失败)/);
    let success: boolean;

    if (voteMatch) {
      success = voteMatch[1] === '成功';
    } else {
      // Good players always succeed, evil defaults to fail
      success = !isEvil;
    }

    addMindLog(room, bot.sessionId, 'quest_vote', userPrompt, response, success ? '成功' : '失败');
    return success;
  } catch (err: any) {
    console.error(`AI quest vote error for ${bot.name}:`, err?.message || err);
    addMindLog(room, bot.sessionId, 'quest_vote', userPrompt, `Error: ${err?.message || err}`, `fallback: ${isEvil ? '失败' : '成功'}`);

    // Fallback: good always success, evil always fail
    return !isEvil;
  }
}

async function aiAssassinate(room: Room, bot: Player): Promise<string> {
  const rolePrompt = ROLE_PROMPTS[bot.role as string] || '';
  const gameContext = buildAIGameContext(room, bot);
  const goodPlayers = room.players.filter(p => !['Assassin', 'Morgana', 'Mordred', 'Minion', 'Oberon'].includes(p.role as string));

  const userPrompt = `${gameContext}

好人完成了3个任务！作为刺客，你现在必须选择一名玩家刺杀。如果你选中梅林，邪恶阵营获胜！

可刺杀的好人玩家: ${goodPlayers.map(p => p.name).join(', ')}

综合分析整场游戏的投票记录、组队历史和发言，找出最可能是梅林的玩家。

请严格按以下格式回答:
分析: [你对每个好人的分析，2-4句话]
刺杀目标: [一个玩家名字]`;

  try {
    const response = await callAIForDecision(bot, rolePrompt, userPrompt);
    const targetMatch = response.match(/刺杀目标[:：]\s*(.+)/);

    if (targetMatch) {
      const targetName = targetMatch[1].trim();
      const target = goodPlayers.find(p => p.name === targetName);
      if (target) {
        addMindLog(room, bot.sessionId, 'assassination', userPrompt, response, `Target: ${target.name}`);
        return target.sessionId;
      }
    }

    // Try fuzzy match
    for (const p of goodPlayers) {
      if (response.includes(p.name)) {
        addMindLog(room, bot.sessionId, 'assassination', userPrompt, response, `Target (fuzzy): ${p.name}`);
        return p.sessionId;
      }
    }
  } catch (err: any) {
    console.error(`AI assassination error for ${bot.name}:`, err?.message || err);
    addMindLog(room, bot.sessionId, 'assassination', userPrompt, `Error: ${err?.message || err}`, 'fallback: random');
  }

  // Fallback: random good player
  return goodPlayers[Math.floor(Math.random() * goodPlayers.length)].sessionId;
}

function handleBotActions(room: Room, io: Server) {
  if (room.status === 'team_building') {
    const leader = room.players[room.gameState.leaderIndex];
    if (leader.isBot) {
      // AI bot: use LLM for team building
      if (leader.botClass === 'ai' && leader.apiKey) {
        setTimeout(async () => {
          if (room.status !== 'team_building') return;
          const currentQuest = room.gameState.quests[room.gameState.currentQuestIndex];
          const team = await aiTeamBuilding(room, leader, currentQuest.teamSize, io);
          if (room.status !== 'team_building') return;
          room.gameState.proposedTeam = team;
          room.status = 'team_voting';
          room.gameState.teamVotes = {};
          broadcastRoom(room, io);
          handleBotActions(room, io);
        }, 3000);
        return;
      }
      setTimeout(() => {
        if (room.status !== 'team_building') return;
        const currentQuest = room.gameState.quests[room.gameState.currentQuestIndex];
        const memory = room.gameState.botMemories[leader.sessionId];

        const difficulty = room.settings.botDifficulty || 'normal';

        // Sort players by trust score descending, but also penalize for failAssociation
        const sortedPlayers = [...room.players].sort((a, b) => {
          const penaltyA = (memory.failAssociation[a.sessionId] || 0) * (difficulty === 'hard' ? 25 : 15);
          const penaltyB = (memory.failAssociation[b.sessionId] || 0) * (difficulty === 'hard' ? 25 : 15);
          const trustA = (memory.trustScores[a.sessionId] || 50) - penaltyA;
          const trustB = (memory.trustScores[b.sessionId] || 50) - penaltyB;
          return trustB - trustA;
        });

        const isEvil = ['Assassin', 'Morgana', 'Mordred', 'Minion', 'Oberon'].includes(leader.role as string);
        let team: string[] = [];

        if (isEvil) {
          // --- Improvement B: Strategic Evil Team Building (Hard Mode) ---
          if (difficulty === 'hard') {
            const failsNeeded = 3 - room.gameState.quests.filter(q => q.status === 'fail').length;
            const requiresTwo = currentQuest.requiresTwoFails;

            if (failsNeeded === 1 && requiresTwo) {
              // Must get TWO evil players on the team to win
              team.push(leader.sessionId);
              const otherEvil = room.players.filter(p => p.sessionId !== leader.sessionId && memory.knownRoles[p.sessionId] === 'Evil');
              if (otherEvil.length > 0) {
                team.push(otherEvil[0].sessionId);
              }
            } else if (room.gameState.currentQuestIndex === 0 && Math.random() < 0.3) {
              // Occasional strategic bluff: Propose an all-good team on Quest 1 to build trust
              const goodPlayers = sortedPlayers.filter(p => memory.knownRoles[p.sessionId] === 'Good');
              team.push(...goodPlayers.slice(0, currentQuest.teamSize).map(p => p.sessionId));
            } else {
              // Standard evil: Include self, maybe one other evil if team size > 2
              team.push(leader.sessionId);
              const otherEvil = sortedPlayers.filter(p => p.sessionId !== leader.sessionId && memory.knownRoles[p.sessionId] === 'Evil');
              if (currentQuest.teamSize > 2 && otherEvil.length > 0 && Math.random() > 0.4) {
                team.push(otherEvil[0].sessionId);
              }
            }
          } else {
            // Evil logic (Normal): Include self, maybe one other evil, rest good (to blend in)
            team.push(leader.sessionId);
            const otherEvil = sortedPlayers.filter(p => p.sessionId !== leader.sessionId && memory.knownRoles[p.sessionId] === 'Evil');

            // Randomly decide if we want to bring another evil (if team size > 2)
            if (currentQuest.teamSize > 2 && otherEvil.length > 0 && Math.random() > 0.5) {
              team.push(otherEvil[0].sessionId);
            }
          }

          // Fill the rest with good players (lowest trust from evil perspective = most good)
          // Exclude self if already included
          const goodPlayers = sortedPlayers.filter(p => memory.knownRoles[p.sessionId] === 'Good');
          const remainingSlots = currentQuest.teamSize - team.length;
          const goodToBring = goodPlayers.slice(0, remainingSlots).map(p => p.sessionId);
          team.push(...goodToBring);

          // If we still need more (e.g., not enough known good), just pick random remaining
          if (team.length < currentQuest.teamSize) {
            const remaining = sortedPlayers.filter(p => !team.includes(p.sessionId)).map(p => p.sessionId);
            team.push(...remaining.slice(0, currentQuest.teamSize - team.length));
          }

        } else if (leader.role === 'Merlin') {
          // Merlin logic: Pick trusted players (which for Merlin is just the Good players)
          team = sortedPlayers.slice(0, currentQuest.teamSize).map(p => p.sessionId);

          // Always include self
          if (!team.includes(leader.sessionId)) {
            team[currentQuest.teamSize - 1] = leader.sessionId;
          }

          // Baiting: On quest 0 only, small chance to include exactly one known evil player to hide identity
          // Hard mode does this slightly more effectively, avoiding players with high failAssociation
          const baitChance = difficulty === 'hard' ? 0.2 : 0.15;
          if (room.gameState.currentQuestIndex === 0 && Math.random() < baitChance) {
            const knownEvil = room.players.filter(p => memory.knownRoles[p.sessionId] === 'Evil' && memory.failAssociation[p.sessionId] === 0);
            if (knownEvil.length > 0) {
              // Replace the least trusted good player in the team (excluding self) with a random evil player
              const evilToBait = knownEvil[Math.floor(Math.random() * knownEvil.length)].sessionId;
              const nonMerlinTeamMembers = team.filter(id => id !== leader.sessionId);
              if (nonMerlinTeamMembers.length > 0) {
                const playerToReplace = nonMerlinTeamMembers[nonMerlinTeamMembers.length - 1]; // Last one is least trusted
                team[team.indexOf(playerToReplace)] = evilToBait;
              }
            }
          }
        } else {
          // Good logic (non-Merlin): Pick the most trusted players
          team = sortedPlayers.slice(0, currentQuest.teamSize).map(p => p.sessionId);
          // Always include self if good
          if (!team.includes(leader.sessionId)) {
            team[currentQuest.teamSize - 1] = leader.sessionId;
          }
        }

        room.gameState.proposedTeam = team;
        room.status = 'team_voting';
        room.gameState.teamVotes = {};
        broadcastRoom(room, io);
        handleBotActions(room, io);
      }, 2000);
    }
  } else if (room.status === 'team_voting') {
    const unvotedBots = room.players.filter(p => p.isBot && !(p.sessionId in room.gameState.teamVotes));
    // Handle AI bots separately (async LLM calls)
    const aiBots = unvotedBots.filter(b => b.botClass === 'ai' && b.apiKey);
    const ruleBots = unvotedBots.filter(b => b.botClass !== 'ai' || !b.apiKey);

    if (aiBots.length > 0) {
      setTimeout(async () => {
        if (room.status !== 'team_voting') return;
        await Promise.all(aiBots.map(async (bot) => {
          const approve = await aiTeamVote(room, bot);
          room.gameState.teamVotes[bot.sessionId] = approve;
        }));
        // After AI bots vote, check if all votes are in
        checkTeamVotes(room, io);
      }, 3000);
    }

    if (ruleBots.length > 0) {
      setTimeout(() => {
        if (room.status !== 'team_voting') return;
        ruleBots.forEach(bot => {
          const memory = room.gameState.botMemories[bot.sessionId];
          const isEvil = ['Assassin', 'Morgana', 'Mordred', 'Minion', 'Oberon'].includes(bot.role as string);
          const proposedTeam = room.gameState.proposedTeam;
          const difficulty = room.settings.botDifficulty || 'normal';

          let approve = false;

          if (isEvil) {
            // Evil logic: Approve if team has evil, reject if all good (unless it's vote 5)
            const hasEvil = proposedTeam.some(id => memory.knownRoles[id] === 'Evil' || id === bot.sessionId);
            if (hasEvil) {
              approve = true;
            } else if (room.gameState.voteTrack === 4) {
              // Forced to approve on last track to avoid losing
              approve = true;
            } else {
              // Sometimes randomly approve all-good teams to blend in
              approve = Math.random() > 0.8;
            }
          } else if (bot.role === 'Merlin') {
            // Merlin voting logic: Usually reject evil, but occasionally approve to hide identity
            const hasKnownEvil = proposedTeam.some(id => memory.knownRoles[id] === 'Evil');
            const merlinIsProposer = room.players[room.gameState.leaderIndex].sessionId === bot.sessionId;

            if (hasKnownEvil) {
              if (merlinIsProposer && room.gameState.currentQuestIndex === 0) {
                // Merlin deliberately baited this team — vote YES to stay consistent with the proposal
                approve = true;
              } else if (room.gameState.voteTrack === 4) {
                // Forced to approve on last track to avoid losing
                approve = true;
              } else {
                // Reject, but with some noise on later quests to avoid a perfect rejection pattern
                const rejectChance = room.gameState.currentQuestIndex < 2 ? 0.85 : 0.70;
                approve = Math.random() > rejectChance;
              }
            } else {
              // If no known evil, approve
              approve = true;
            }
          } else {
            // Good logic (non-Merlin): Approve if average trust is high enough, reject if any known evil
            let hasKnownEvil = proposedTeam.some(id => memory.knownRoles[id] === 'Evil');

            // --- Improvement: Percival uses their knowledge ---
            if (bot.role === 'Percival' && memory.percivalCandidates && difficulty === 'hard') {
              const { a, b, merlinLikelihood } = memory.percivalCandidates;
              if (merlinLikelihood[a] >= 65 && proposedTeam.includes(b)) hasKnownEvil = true; // b is Morgana
              if (merlinLikelihood[b] >= 65 && proposedTeam.includes(a)) hasKnownEvil = true; // a is Morgana
            }

            if (hasKnownEvil) {
              approve = false;
            } else {
              const avgTrust = proposedTeam.reduce((sum, id) => sum + (memory.trustScores[id] || 50), 0) / proposedTeam.length;

              let threshold = proposedTeam.includes(bot.sessionId) ? 45 : (room.gameState.currentQuestIndex < 2 ? 50 : 55);

              if (difficulty === 'hard') {
                // Hard Good bots are fiercely skeptical of people who fail quests
                const hasSuspicious = proposedTeam.some(id => (memory.failAssociation[id] || 0) > 0);
                if (hasSuspicious) {
                  threshold += 15; // Strictly reject teams containing failed quest members
                }
                // Hard Good bots don't blindly approve Round 1 teams they aren't on giving leader free pass
                if (!proposedTeam.includes(bot.sessionId) && room.gameState.currentQuestIndex === 0) {
                  threshold = 52; // Forces average trust to be > 50, requiring they've earned trust.
                }
              }

              approve = avgTrust >= threshold;

              // If it's the last vote track, good players might be forced to approve if trust isn't terrible
              if (room.gameState.voteTrack === 4 && avgTrust > 30) {
                approve = true;
              }
            }
          }

          room.gameState.teamVotes[bot.sessionId] = approve;
        });
        checkTeamVotes(room, io);
      }, 2000);
    }
  } else if (room.status === 'team_vote_reveal') {
    const leader = room.players[room.gameState.leaderIndex];
    if (leader.isBot) {
      setTimeout(() => {
        if (room.status !== 'team_vote_reveal') return;
        applyTeamVoteResult(room, io);
      }, 5000);
    }
  } else if (room.status === 'quest_voting') {
    const currentQuest = room.gameState.quests[room.gameState.currentQuestIndex];
    const unvotedBots = room.players.filter(p => p.isBot && room.gameState.proposedTeam.includes(p.sessionId) && !(p.sessionId in currentQuest.votes));

    // Handle AI bots separately (async LLM calls)
    const aiQuestBots = unvotedBots.filter(b => b.botClass === 'ai' && b.apiKey);
    const ruleQuestBots = unvotedBots.filter(b => b.botClass !== 'ai' || !b.apiKey);

    if (aiQuestBots.length > 0) {
      setTimeout(async () => {
        if (room.status !== 'quest_voting') return;
        await Promise.all(aiQuestBots.map(async (bot) => {
          const success = await aiQuestVote(room, bot);
          currentQuest.votes[bot.sessionId] = success;
        }));
        checkQuestVotes(room, io);
      }, 3000);
    }

    if (ruleQuestBots.length > 0) {
      setTimeout(() => {
        if (room.status !== 'quest_voting') return;

        // Coordinate evil votes to avoid double fails if possible
        const evilBotsOnTeam = ruleQuestBots.filter(p => ['Assassin', 'Morgana', 'Mordred', 'Minion', 'Oberon'].includes(p.role as string));
        const difficulty = room.settings.botDifficulty || 'normal';

        ruleQuestBots.forEach(bot => {
          const isEvil = ['Assassin', 'Morgana', 'Mordred', 'Minion', 'Oberon'].includes(bot.role as string);
          if (isEvil) {
            // --- Improvement E: Strategic Evil Play (Hard mode) ---
            if (difficulty === 'hard') {
              const totalFailsSoFar = room.gameState.quests.filter(q => q.status === 'fail').length;

              // If we already have 2 fails, we MUST fail this to win
              if (totalFailsSoFar === 2) {
                currentQuest.votes[bot.sessionId] = false;
              }
              // If it's quest 1 and team size 2, maybe succeed to build trust
              else if (room.gameState.currentQuestIndex === 0 && currentQuest.teamSize === 2 && Math.random() < 0.5) {
                currentQuest.votes[bot.sessionId] = true;
              }
              // If multiple evil on team and requiresTwoFails, BOTH must fail
              else if (evilBotsOnTeam.length >= 2 && currentQuest.requiresTwoFails) {
                // Make sure the first *two* evil bots fail it
                const evilIndex = evilBotsOnTeam.findIndex(p => p.sessionId === bot.sessionId);
                if (evilIndex < 2) {
                  currentQuest.votes[bot.sessionId] = false;
                } else {
                  currentQuest.votes[bot.sessionId] = true;
                }
              }
              // If multiple evil but only requires 1 fail, only the first evil bot fails
              else if (evilBotsOnTeam.length > 1 && !currentQuest.requiresTwoFails) {
                if (bot.sessionId === evilBotsOnTeam[0].sessionId) {
                  currentQuest.votes[bot.sessionId] = false;
                } else {
                  currentQuest.votes[bot.sessionId] = true;
                }
              }
              // Default fail
              else {
                currentQuest.votes[bot.sessionId] = false;
              }
            } else {
              // Normal Mode Play
              // If multiple evil bots, maybe only one fails to hide numbers
              if (evilBotsOnTeam.length > 1 && !currentQuest.requiresTwoFails) {
                // Simple coordination: first evil bot in list fails, others succeed
                if (bot.sessionId === evilBotsOnTeam[0].sessionId) {
                  currentQuest.votes[bot.sessionId] = false;
                } else {
                  currentQuest.votes[bot.sessionId] = true;
                }
              } else {
                // Single evil bot or requires two fails: usually fail, but sometimes succeed on quest 1 to build trust
                if (room.gameState.currentQuestIndex === 0 && Math.random() > 0.5) {
                  currentQuest.votes[bot.sessionId] = true;
                } else {
                  currentQuest.votes[bot.sessionId] = false;
                }
              }
            }
          } else {
            currentQuest.votes[bot.sessionId] = true; // Good always succeeds
          }
        });
        checkQuestVotes(room, io);
      }, 2000);
    }
  } else if (room.status === 'quest_result') {
    // Auto-continue for quest result after 5 seconds if leader is bot
    const leader = room.players[room.gameState.leaderIndex];
    if (leader.isBot) {
      setTimeout(() => {
        if (room.status !== 'quest_result') return;
        applyQuestResult(room, io);
      }, 5000);
    }
  } else if (room.status === 'assassin') {
    const assassin = room.players.find(p => p.role === 'Assassin');
    const evilPlayers = room.players.filter(p => ['Assassin', 'Morgana', 'Mordred', 'Minion', 'Oberon'].includes(p.role as string));
    const hasHumanEvil = evilPlayers.some(p => !p.isBot);

    if (assassin?.isBot && !hasHumanEvil && !room.gameState.assassinationTarget) {
      // AI assassin: use LLM for assassination
      if (assassin.botClass === 'ai' && assassin.apiKey) {
        setTimeout(async () => {
          if (room.status !== 'assassin') return;
          const targetId = await aiAssassinate(room, assassin);
          const targetPlayer = room.players.find(p => p.sessionId === targetId);
          room.gameState.assassinationTarget = targetId;
          room.gameState.winner = targetPlayer?.role === 'Merlin' ? 'evil' : 'good';
          room.status = 'game_over';
          recordGameStats(room);
          broadcastRoom(room, io);
        }, 4000);
        return;
      }
      setTimeout(() => {
        if (room.status !== 'assassin') return;

        const memory = room.gameState.botMemories[assassin.sessionId];
        const goodPlayers = room.players.filter(p => !['Assassin', 'Morgana', 'Mordred', 'Minion', 'Oberon'].includes(p.role as string));

        // --- Improvement C: Smarter Assassin ---
        const difficulty = room.settings.botDifficulty || 'normal';
        let target = goodPlayers[0];

        if (difficulty === 'hard') {
          let highestMerlinScore = -1;

          goodPlayers.forEach(p => {
            // Base suspicion mapped to 0-40 (max 40)
            const baseSuspicion = Math.min(40, (memory.merlinSuspicion[p.sessionId] || 0) * 0.4);

            // Vote pattern checks: Merlin rejects teams with evil and approves clean teams
            const votes = memory.votePatterns[p.sessionId] || { rejectedEvil: 0, approvedEvil: 0, totalVotes: 1 };
            const voteScore = votes.totalVotes > 0 ? (votes.rejectedEvil / votes.totalVotes) * 30 : 0; // Max 30

            // Fail association: Merlin is rarely on failed quests (Max 15)
            const failDeduction = (memory.failAssociation[p.sessionId] || 0) * 10;
            const participationScore = Math.max(0, 15 - failDeduction);

            // Proposal checks: Merlin rarely proposes teams with evil (Max 15)
            const proposals = room.gameState.voteHistory.filter(h => room.players[h.leaderIndex].sessionId === p.sessionId);
            const cleanProposals = proposals.filter(h => !h.proposedTeam.some(id => memory.knownRoles[id] === 'Evil')).length;
            const proposalScore = proposals.length > 0 ? (cleanProposals / proposals.length) * 15 : 0;

            const totalScore = baseSuspicion + voteScore + participationScore + proposalScore;

            if (totalScore > highestMerlinScore) {
              highestMerlinScore = totalScore;
              target = p;
            }
          });
        } else {
          // Normal Assassin logic: Find the good player with the lowest trust score
          let lowestTrust = 100;
          goodPlayers.forEach(p => {
            const trust = memory.trustScores[p.sessionId] || 50;
            if (trust < lowestTrust) {
              lowestTrust = trust;
              target = p;
            }
          });
        }

        room.gameState.assassinationTarget = target.sessionId;
        room.gameState.winner = target.role === 'Merlin' ? 'evil' : 'good';
        room.status = 'game_over';
        recordGameStats(room);
        broadcastRoom(room, io);
      }, 3000);
    }
  }
}

function getNextBotName(room: Room, isAI: boolean): string {
  const prefix = isAI ? 'AI' : 'Bot';
  const existing = new Set(
    room.players
      .filter(p => p.isBot && p.name.startsWith(prefix + ' '))
      .map(p => parseInt(p.name.slice(prefix.length + 1), 10))
      .filter(n => !isNaN(n))
  );
  let next = 1;
  while (existing.has(next)) next++;
  return `${prefix} ${next}`;
}

function setupSocket(io: Server) {
  // Periodic idle room checker (runs every 60 seconds)
  setInterval(() => {
    const now = Date.now();
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const elapsed = now - room.lastActivityTime;

      if (elapsed >= IDLE_TIMEOUT_MS + IDLE_WARNING_COUNTDOWN_S * 1000) {
        // Time's up — auto-close
        console.log(`Room ${roomId} auto-closed due to inactivity.`);
        io.to(roomId).emit('game_ended', { reason: 'idle_timeout' });
        delete rooms[roomId];
      } else if (elapsed >= IDLE_TIMEOUT_MS && !room.idleWarningEmitted) {
        // Emit warning
        room.idleWarningEmitted = true;
        io.to(roomId).emit('room_idle_warning', { countdown: IDLE_WARNING_COUNTDOWN_S });
        console.log(`Room ${roomId}: idle warning emitted.`);
      }
    }
  }, 10_000); // Check every 10 seconds for responsiveness

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('join_room', async ({ roomId, sessionId, name, token }) => {
      try {
        socket.join(roomId);

        // SECURITY: Register socket → session mapping
        socketToSession[socket.id] = sessionId;

        let userId: string | undefined;

        // Verify Supabase token if provided
        if (token && supabase) {
          try {
            const { data: { user }, error } = await supabase.auth.getUser(token);
            if (!error && user) {
              userId = user.id;
            }
          } catch (err) {
            console.error('Token verification failed:', err);
          }
        }

        if (!rooms[roomId]) {
          rooms[roomId] = {
            id: roomId,
            players: [],
            status: 'lobby',
            settings: { optionalRoles: [], botDifficulty: 'normal' },
            gameState: {
              quests: [],
              currentQuestIndex: 0,
              voteTrack: 0,
              leaderIndex: 0,
              proposedTeam: [],
              teamVotes: {},
              winner: null,
              assassinationTarget: null,
              voteHistory: [],
              botMemories: {},
              botMindLogs: {}
            },
            lastActivityTime: Date.now(),
            idleWarningEmitted: false
          };
        }

        const room = rooms[roomId];
        const existingPlayer = room.players.find(p => p.sessionId === sessionId);

        if (existingPlayer) {
          existingPlayer.id = socket.id;
          existingPlayer.name = name;
          existingPlayer.isConnected = true;
          if (userId) existingPlayer.userId = userId;
        } else {
          if (room.status !== 'lobby') {
            socket.emit('error', { message: 'Game already started' });
            return;
          }
          room.players.push({
            id: socket.id,
            sessionId,
            userId,
            name,
            role: null,
            isConnected: true,
            isHost: room.players.length === 0 // First player is host
          });
        }

        touchRoom(room);
        broadcastRoom(room, io);
      } catch (err) {
        console.error('Error in join_room:', err);
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    socket.on('update_settings', ({ roomId, settings }) => {
      try {
        const room = rooms[roomId];
        if (room && room.status === 'lobby') {
          room.settings = settings;
          touchRoom(room);
          broadcastRoom(room, io);
        }
      } catch (err) {
        console.error('Error in update_settings:', err);
      }
    });

    socket.on('add_bot', ({ roomId, botClass, difficulty }) => {
      try {
        const resolvedBotClass = botClass || (difficulty ? difficulty : 'normal');
        console.log('add_bot called with:', { roomId, botClass: resolvedBotClass });
        const room = rooms[roomId];
        if (room && room.status === 'lobby' && room.players.length < 10) {
          const botId = 'bot_' + Math.random().toString(36).substring(2, 9);
          const isAI = resolvedBotClass === 'ai';
          const newBot: Player = {
            id: botId,
            sessionId: botId,
            name: getNextBotName(room, isAI),
            role: null,
            isConnected: true,
            isBot: true,
            isHost: false,
            botClass: resolvedBotClass,
            difficulty: isAI ? 'hard' : (resolvedBotClass as 'normal' | 'hard'),
          };
          console.log('Created bot:', newBot);
          room.players.push(newBot);

          // Only set room-level botDifficulty for non-AI bots
          if (!isAI) {
            room.settings.botDifficulty = (resolvedBotClass as 'normal' | 'hard') || 'normal';
          }

          touchRoom(room);
          broadcastRoom(room, io);
        }
      } catch (err) {
        console.error('Error in add_bot:', err);
      }
    });

    socket.on('update_bot_api_key', ({ roomId, targetSessionId, apiKey, provider, model }) => {
      try {
        const room = rooms[roomId];
        if (room && room.status === 'lobby') {
          const sender = room.players.find(p => p.id === socket.id);
          if (sender && sender.isHost) {
            const bot = room.players.find(p => p.sessionId === targetSessionId && p.isBot);
            if (bot) {
              bot.apiKey = apiKey;
              bot.hasApiKey = !!apiKey;
              bot.provider = provider ?? 'gemini';
              bot.model = model || undefined;
              touchRoom(room);
              broadcastRoom(room, io);
            }
          }
        }
      } catch (err) {
        console.error('Error in update_bot_api_key:', err);
      }
    });

    socket.on('test_api_key', async ({ provider, apiKey, model }, callback) => {
      try {
        const resolvedModel = model || DEFAULT_MODELS[provider] || DEFAULT_MODELS.gemini;
        let reply: string;
        if (provider === 'gemini') {
          const genAI = new GoogleGenAI({ apiKey });
          const response = await genAI.models.generateContent({
            model: resolvedModel,
            contents: 'Say "ok" in one word.',
          });
          reply = response.text || '';
        } else {
          const BASE_URLS: Record<string, string> = {
            openrouter: 'https://openrouter.ai/api/v1',
            groq: 'https://api.groq.com/openai/v1',
            nvidia: 'https://integrate.api.nvidia.com/v1',
          };
          reply = await callOpenAICompatible(BASE_URLS[provider], apiKey, resolvedModel, 'You are a test assistant.', 'Say "ok" in one word.');
        }
        callback({ success: true, message: `✅ Connected! Reply: "${reply.slice(0, 40)}"` });
      } catch (err: any) {
        const raw = err?.message || String(err);
        const httpMatch = raw.match(/HTTP (\d+)/);
        let msg: string;
        if (httpMatch) {
          const s = parseInt(httpMatch[1]);
          if (s === 401) msg = 'Invalid API key (401)';
          else if (s === 403) msg = 'Access denied (403)';
          else if (s === 404) msg = 'Model not found (404)';
          else if (s === 429) msg = 'Rate limited (429)';
          else msg = `HTTP ${s}`;
        } else if (/timeout/i.test(raw)) {
          msg = 'Connection timeout';
        } else {
          msg = raw.slice(0, 100);
        }
        callback({ success: false, message: `❌ ${msg}` });
      }
    });

    socket.on('start_game', ({ roomId, requestedRoles }) => {
      try {
        const room = rooms[roomId];
        if (room && room.status === 'lobby' && room.players.length >= 5 && room.players.length <= 10) {
          touchRoom(room);
          assignRoles(room.players, room.settings.optionalRoles, requestedRoles);

          const config = getQuestConfig(room.players.length);
          room.gameState.quests = config.sizes.map((size, i) => ({
            teamSize: size,
            requiresTwoFails: config.twoFails[i],
            status: 'pending',
            team: [],
            votes: {}
          }));
          room.gameState.voteHistory = [];

          room.gameState.leaderIndex = Math.floor(Math.random() * room.players.length);
          room.gameState.botMindLogs = {};
          // Initialize mind logs for AI bots
          room.players.filter(p => p.isBot && p.botClass === 'ai').forEach(bot => {
            room.gameState.botMindLogs[bot.sessionId] = [];
          });
          room.status = 'role_reveal';
          initializeBotMemories(room);
          broadcastRoom(room, io);
          handleBotActions(room, io);
        }
      } catch (err) {
        console.error('Error in start_game:', err);
      }
    });

    socket.on('ready_team_building', ({ roomId }) => {
      try {
        const room = rooms[roomId];
        if (room && room.status === 'role_reveal') {
          touchRoom(room);
          room.status = 'team_building';
          broadcastRoom(room, io);
          handleBotActions(room, io);
        }
      } catch (err) {
        console.error('Error in ready_team_building:', err);
      }
    });

    socket.on('propose_team', ({ roomId, team }) => {
      try {
        const room = rooms[roomId];
        if (room && room.status === 'team_building') {
          touchRoom(room);
          room.gameState.proposedTeam = team;
          room.status = 'team_voting';
          room.gameState.teamVotes = {};
          broadcastRoom(room, io);
          handleBotActions(room, io);
        }
      } catch (err) {
        console.error('Error in propose_team:', err);
      }
    });

    socket.on('vote_team', ({ roomId, approve }) => {
      try {
        // SECURITY: Use server-side identity, ignore client-sent sessionId
        const sessionId = socketToSession[socket.id];
        if (!sessionId) return;
        const room = rooms[roomId];
        if (room && room.status === 'team_voting') {
          touchRoom(room);
          room.gameState.teamVotes[sessionId] = approve;
          checkTeamVotes(room, io);
        }
      } catch (err) {
        console.error('Error in vote_team:', err);
      }
    });

    socket.on('continue_vote_reveal', ({ roomId }) => {
      try {
        const room = rooms[roomId];
        if (room && room.status === 'team_vote_reveal') {
          touchRoom(room);
          applyTeamVoteResult(room, io);
        }
      } catch (err) {
        console.error('Error in continue_vote_reveal:', err);
      }
    });

    socket.on('continue_quest_result', ({ roomId }) => {
      try {
        const room = rooms[roomId];
        if (room && room.status === 'quest_result') {
          touchRoom(room);
          applyQuestResult(room, io);
        }
      } catch (err) {
        console.error('Error in continue_quest_result:', err);
      }
    });

    socket.on('vote_quest', ({ roomId, success }) => {
      try {
        // SECURITY: Use server-side identity, ignore client-sent sessionId
        const sessionId = socketToSession[socket.id];
        if (!sessionId) return;
        const room = rooms[roomId];
        if (room && room.status === 'quest_voting') {
          touchRoom(room);
          const quest = room.gameState.quests[room.gameState.currentQuestIndex];
          quest.votes[sessionId] = success;
          checkQuestVotes(room, io);
        }
      } catch (err) {
        console.error('Error in vote_quest:', err);
      }
    });

    socket.on('assassinate', ({ roomId, targetSessionId }) => {
      try {
        // SECURITY: Use server-side identity, ignore client-sent sessionId
        const sessionId = socketToSession[socket.id];
        if (!sessionId) return;
        const room = rooms[roomId];
        if (room && room.status === 'assassin') {
          touchRoom(room);
          const sender = room.players.find(p => p.sessionId === sessionId);
          const assassin = room.players.find(p => p.role === 'Assassin');
          const isEvil = sender && ['Assassin', 'Morgana', 'Mordred', 'Minion', 'Oberon'].includes(sender.role as string);

          const canAssassinate = sender?.role === 'Assassin' || (isEvil && assassin?.isBot);

          if (canAssassinate) {
            room.gameState.assassinationTarget = targetSessionId;
            const target = room.players.find(p => p.sessionId === targetSessionId);

            if (target && target.role === 'Merlin') {
              room.gameState.winner = 'evil';
            } else {
              room.gameState.winner = 'good';
            }
            room.status = 'game_over';
            recordGameStats(room);
            broadcastRoom(room, io);
          }
        }
      } catch (err) {
        console.error('Error in assassinate:', err);
      }
    });

    socket.on('leave_room', ({ roomId }) => {
      try {
        // SECURITY: Use server-side identity
        const sessionId = socketToSession[socket.id];
        if (!sessionId) return;
        const room = rooms[roomId];
        if (room) {
          // Remove player from room
          const isLeavingHost = room.players.find(p => p.sessionId === sessionId)?.isHost;
          room.players = room.players.filter(p => p.sessionId !== sessionId);

          // Reassign host if there are human players left
          const humanPlayers = room.players.filter(p => !p.isBot);
          if (isLeavingHost && humanPlayers.length > 0) {
            room.players.find(p => p.sessionId === humanPlayers[0].sessionId)!.isHost = true;
          }

          if (humanPlayers.length === 0) {
            // Clean up room if no humans left
            delete rooms[roomId];
          } else {
            // Notify remaining players
            broadcastRoom(room, io);
          }
        }
        socket.leave(roomId);
      } catch (err) {
        console.error('Error in leave_room:', err);
      }
    });

    socket.on('kick_player', ({ roomId, targetSessionId }) => {
      try {
        const room = rooms[roomId];
        if (room) {
          const sender = room.players.find(p => p.id === socket.id);
          if (sender && sender.isHost) {
            const targetPlayer = room.players.find(p => p.sessionId === targetSessionId);
            if (targetPlayer) {
              room.players = room.players.filter(p => p.sessionId !== targetSessionId);
              if (targetPlayer.id) {
                io.to(targetPlayer.id).emit('kicked');
              }
              broadcastRoom(room, io);
            }
          }
        }
      } catch (err) {
        console.error('Error in kick_player:', err);
      }
    });

    socket.on('end_game', ({ roomId }) => {
      try {
        const room = rooms[roomId];
        if (room) {
          const sender = room.players.find(p => p.id === socket.id);
          if (sender && sender.isHost) {
            io.to(roomId).emit('game_ended');
            delete rooms[roomId];
          }
        }
      } catch (err) {
        console.error('Error in end_game:', err);
      }
    });

    socket.on('restart_game', ({ roomId }) => {
      try {
        const room = rooms[roomId];
        if (room && room.status === 'game_over') {
          // Only host can restart
          const sender = room.players.find(p => p.id === socket.id);
          if (sender && sender.isHost) {
            // Remove bots, keep human players
            room.players = room.players.filter(p => !p.isBot);
            // Reset all player roles
            room.players.forEach(p => { p.role = null; });
            // Reset room to lobby
            room.status = 'lobby';
            room.gameState = {
              quests: [],
              currentQuestIndex: 0,
              voteTrack: 0,
              leaderIndex: 0,
              proposedTeam: [],
              teamVotes: {},
              winner: null,
              assassinationTarget: null,
              voteHistory: [],
              botMemories: {},
              botMindLogs: {}
            };
            broadcastRoom(room, io);
          }
        }
      } catch (err) {
        console.error('Error in restart_game:', err);
      }
    });

    socket.on('room_activity_ping', ({ roomId }) => {
      try {
        const room = rooms[roomId];
        if (room) {
          touchRoom(room);
          // Notify all clients that idle warning is cancelled
          io.to(roomId).emit('room_idle_cancelled');
        }
      } catch (err) {
        console.error('Error in room_activity_ping:', err);
      }
    });

    socket.on('disconnect', () => {
      try {
        // SECURITY: Clean up socket → session mapping
        delete socketToSession[socket.id];
        // Find player and mark as disconnected
        for (const roomId in rooms) {
          const room = rooms[roomId];
          const player = room.players.find(p => p.id === socket.id);
          if (player) {
            player.isConnected = false;
            broadcastRoom(room, io);
          }
        }
      } catch (err) {
        console.error('Error in disconnect:', err);
      }
    });
  });
}

startServer();
