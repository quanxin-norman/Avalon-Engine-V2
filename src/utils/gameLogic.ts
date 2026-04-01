export type Role = 'Merlin' | 'Assassin' | 'Percival' | 'Morgana' | 'Mordred' | 'Oberon' | 'Loyal Servant' | 'Minion';

export interface Player {
  id: string; // socket id
  sessionId: string; // persistent id
  userId?: string; // Supabase auth user id
  name: string;
  role: Role | null;
  isConnected: boolean;
  isHost: boolean;
  isBot?: boolean;
  botClass?: 'normal' | 'hard' | 'ai'; // Bot class: normal/hard are rule-based, ai uses LLM
  apiKey?: string;
  hasApiKey?: boolean;
  provider?: 'gemini' | 'openrouter' | 'groq' | 'nvidia';
  model?: string;
  difficulty?: 'normal' | 'hard'; // Bot difficulty level
}

export function getQuestConfig(playerCount: number) {
  const configs: Record<number, { sizes: number[], twoFails: boolean[] }> = {
    5: { sizes: [2, 3, 2, 3, 3], twoFails: [false, false, false, false, false] },
    6: { sizes: [2, 3, 4, 3, 4], twoFails: [false, false, false, false, false] },
    7: { sizes: [2, 3, 3, 4, 4], twoFails: [false, false, false, true, false] },
    8: { sizes: [3, 4, 4, 5, 5], twoFails: [false, false, false, true, false] },
    9: { sizes: [3, 4, 4, 5, 5], twoFails: [false, false, false, true, false] },
    10: { sizes: [3, 4, 4, 5, 5], twoFails: [false, false, false, true, false] },
  };
  return configs[playerCount] || configs[5];
}

export function assignRoles(players: Player[], optionalRoles: Role[], requestedRoles?: Record<string, Role>) {
  const count = players.length;
  let roles: Role[] = [];

  switch (count) {
    case 5:
      roles = ['Merlin', 'Percival', 'Loyal Servant', 'Morgana', 'Assassin'];
      break;
    case 6:
      roles = ['Merlin', 'Percival', 'Loyal Servant', 'Loyal Servant', 'Morgana', 'Assassin'];
      break;
    case 7:
      roles = ['Merlin', 'Percival', 'Loyal Servant', 'Loyal Servant', 'Morgana', 'Assassin', 'Oberon'];
      break;
    case 8:
      roles = ['Merlin', 'Percival', 'Loyal Servant', 'Loyal Servant', 'Loyal Servant', 'Morgana', 'Assassin', 'Minion'];
      break;
    case 9:
      roles = ['Merlin', 'Percival', 'Loyal Servant', 'Loyal Servant', 'Loyal Servant', 'Loyal Servant', 'Morgana', 'Assassin', 'Mordred'];
      break;
    case 10:
      roles = ['Merlin', 'Percival', 'Loyal Servant', 'Loyal Servant', 'Loyal Servant', 'Loyal Servant', 'Morgana', 'Assassin', 'Oberon', 'Mordred'];
      break;
    default:
      roles = ['Merlin', 'Percival', 'Loyal Servant', 'Morgana', 'Assassin']; // Fallback
  }

  // Handle Forced/Requested Roles (Dev Mode testing)
  if (requestedRoles) {
    Object.entries(requestedRoles).forEach(([sessionId, desiredRole]) => {
      // Find the player 
      const playerIndex = players.findIndex(p => p.sessionId === sessionId);
      if (playerIndex !== -1 && desiredRole) {

        // Is the desired role in the current available pool?
        const roleIndexInPool = roles.indexOf(desiredRole);

        if (roleIndexInPool !== -1) {
          // Yes: just remove it from the pool so we don't assign it again
          roles.splice(roleIndexInPool, 1);
        } else {
          // No: Forced to swap. We need to maintain alignment balance.
          const isEvil = ['Assassin', 'Morgana', 'Mordred', 'Minion', 'Oberon'].includes(desiredRole);

          if (isEvil) {
            // Find another evil role to remove
            const evilIndex = roles.findIndex(r => ['Assassin', 'Morgana', 'Mordred', 'Minion', 'Oberon'].includes(r));
            if (evilIndex !== -1) {
              roles.splice(evilIndex, 1);
            } else {
              roles.pop(); // Fallback if something is weird
            }
          } else {
            // Find another good role to remove
            const goodIndex = roles.findIndex(r => ['Merlin', 'Percival', 'Loyal Servant'].includes(r));
            if (goodIndex !== -1) {
              roles.splice(goodIndex, 1);
            } else {
              roles.pop();
            }
          }
        }

        // Actually assign it
        players[playerIndex].role = desiredRole;
      }
    });
  }

  // Shuffle both remaining roles and players
  shuffle(roles);
  shuffle(players);

  // Assign remaining roles
  players.forEach((p) => {
    if (!p.role) {
      p.role = roles.pop()!;
    }
  });
}

function shuffle<T>(array: T[]): void {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}
