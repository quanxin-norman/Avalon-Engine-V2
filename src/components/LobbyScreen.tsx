import { useGameStore, Role } from "../store";
import { Users, Settings, Play, LogOut, Bot, UserMinus, Plus, ChevronDown, Sparkles, Brain } from "lucide-react";
import { useTranslation } from "../utils/i18n";
import { useState } from "react";

type Provider = 'gemini' | 'openrouter' | 'groq' | 'nvidia';

const PROVIDER_MODELS: Record<Provider, { label: string; value: string }[]> = {
  gemini: [
    { label: 'Gemini 2.0 Flash Lite (free)', value: 'gemini-2.0-flash-lite' },
    { label: 'Gemini 2.0 Flash (free)', value: 'gemini-2.0-flash' },
    { label: 'Gemini 1.5 Flash (free)', value: 'gemini-1.5-flash' },
    { label: 'Gemini 1.5 Flash 8B (free)', value: 'gemini-1.5-flash-8b' },
    { label: 'Gemini 2.5 Flash Preview', value: 'gemini-2.5-flash-preview-04-17' },
  ],
  openrouter: [
    { label: 'Gemini 2.0 Flash Exp (free)', value: 'google/gemini-2.0-flash-exp:free' },
    { label: 'Llama 3.3 70B (free)', value: 'meta-llama/llama-3.3-70b-instruct:free' },
    { label: 'DeepSeek Chat V3 (free)', value: 'deepseek/deepseek-chat-v3-0324:free' },
    { label: 'DeepSeek R1 (free)', value: 'deepseek/deepseek-r1:free' },
    { label: 'Mistral Small 3.1 (free)', value: 'mistralai/mistral-small-3.1-24b-instruct:free' },
  ],
  groq: [
    { label: 'Llama 3.3 70B Versatile', value: 'llama-3.3-70b-versatile' },
    { label: 'Llama 3.1 70B Versatile', value: 'llama-3.1-70b-versatile' },
    { label: 'Llama 3.1 8B Instant', value: 'llama-3.1-8b-instant' },
    { label: 'Gemma 2 9B', value: 'gemma2-9b-it' },
    { label: 'Mixtral 8x7B', value: 'mixtral-8x7b-32768' },
  ],
  nvidia: [
    { label: 'Llama 3.3 70B Instruct', value: 'meta/llama-3.3-70b-instruct' },
    { label: 'Nemotron Super 49B', value: 'nvidia/llama-3.3-nemotron-super-49b-v1.5' },
    { label: 'DeepSeek R1 (0528)', value: 'deepseek-ai/deepseek-r1-0528' },
    { label: 'MiniMax M2.5', value: 'minimaxai/minimax-m2.5' },
    { label: 'Mixtral 8x7B Instruct', value: 'mistralai/mixtral-8x7b-instruct-v0.1' },
  ],
};

export default function LobbyScreen() {
  const room = useGameStore((state) => state.room);
  const sessionId = useGameStore((state) => state.sessionId);
  const updateSettings = useGameStore((state) => state.updateSettings);
  const startGame = useGameStore((state) => state.startGame);
  const leaveRoom = useGameStore((state) => state.leaveRoom);
  const addBot = useGameStore((state) => state.addBot);
  const kickPlayer = useGameStore((state) => state.kickPlayer);
  const endGame = useGameStore((state) => state.endGame);
  const devRequestedRole = useGameStore((state) => state.devRequestedRole);
  const updateBotApiKey = useGameStore((state) => state.updateBotApiKey);
  const testBotApiKey = useGameStore((state) => state.testBotApiKey);
  const { t } = useTranslation();

  const [botConfigs, setBotConfigs] = useState<Record<string, {
    provider: Provider;
    apiKey: string;
    model: string;
    customModel: string;
  }>>({});
  const [testStatus, setTestStatus] = useState<Record<string, string>>({});

  if (!room) return null;

  const getBotConfig = (sid: string) =>
    botConfigs[sid] ?? { provider: 'gemini' as Provider, apiKey: '', model: PROVIDER_MODELS.gemini[0].value, customModel: '' };

  const resolveModel = (cfg: ReturnType<typeof getBotConfig>) =>
    cfg.model === 'custom' ? cfg.customModel : cfg.model;

  const updateLocalBotConfig = (
    sid: string,
    patch: Partial<{ provider: Provider; apiKey: string; model: string; customModel: string }>
  ) => {
    const current = getBotConfig(sid);
    let next = { ...current, ...patch };
    if (patch.provider && patch.provider !== current.provider) {
      next.model = PROVIDER_MODELS[patch.provider][0].value;
      next.customModel = '';
    }
    setBotConfigs(prev => ({ ...prev, [sid]: next }));
    updateBotApiKey(sid, next.apiKey, next.provider, resolveModel(next) || undefined);
    // Clear test result when config changes
    setTestStatus(prev => ({ ...prev, [sid]: '' }));
  };

  const handleTestApiKey = async (sid: string) => {
    const cfg = getBotConfig(sid);
    if (!cfg.apiKey) return;
    setTestStatus(prev => ({ ...prev, [sid]: 'testing' }));
    const result = await testBotApiKey(cfg.provider, cfg.apiKey, resolveModel(cfg) || undefined);
    setTestStatus(prev => ({ ...prev, [sid]: result.message }));
  };

  const isHost = room.players.find(p => p.isHost)?.sessionId === sessionId;
  const canStart = room.players.length >= 5 && room.players.length <= 10;
  const canAddBot = isHost && room.players.length < 10;
  const botCount = room.players.filter(p => p.isBot).length;

  const toggleRole = (role: Role) => {
    if (!isHost) return;
    const current = room.settings.optionalRoles;
    const updated = current.includes(role)
      ? current.filter((r) => r !== role)
      : [...current, role];
    updateSettings({ optionalRoles: updated });
  };

  return (
    <div className="min-h-screen text-zinc-50 relative overflow-hidden">
      {/* Background Image */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: 'url(/lobby-bg.png)' }}
      />
      {/* Dark overlay for readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/60 via-zinc-950/75 to-zinc-950/95" />

      <div className="relative z-10 p-6 flex flex-col max-w-md mx-auto min-h-screen">
        <header className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-serif font-bold tracking-tight">
              {t("Room")} {room.id}
            </h1>
            <p className="text-zinc-400 text-sm">{t("Waiting for players...")}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="bg-zinc-900/70 backdrop-blur-sm px-3 py-1 rounded-full border border-zinc-700/50 flex items-center gap-2">
              <Users size={16} className="text-zinc-400" />
              <span className="font-mono text-sm">{room.players.length}/10</span>
            </div>
            {isHost ? (
              <button
                onClick={endGame}
                className="p-2 bg-zinc-900/70 backdrop-blur-sm hover:bg-red-900/40 border border-zinc-700/50 hover:border-red-500/50 rounded-full text-zinc-400 hover:text-red-400 transition-colors"
                title={t("End Game")}
              >
                <LogOut size={16} />
              </button>
            ) : (
              <button
                onClick={leaveRoom}
                className="p-2 bg-zinc-900/70 backdrop-blur-sm hover:bg-zinc-800 border border-zinc-700/50 rounded-full text-zinc-400 transition-colors"
                title={t("Leave Room")}
              >
                <LogOut size={16} />
              </button>
            )}
          </div>
        </header>

        <div className="flex-1 space-y-8">
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                {t("Players")}
              </h2>
              {canAddBot && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => addBot('normal')}
                    className="text-xs flex items-center gap-1 text-white font-medium transition-all duration-200 bg-gradient-to-r from-zinc-700 to-zinc-600 px-1.5 py-0.5 rounded-lg border border-zinc-500/30 hover:from-zinc-600 hover:to-zinc-500 hover:shadow-lg hover:shadow-zinc-500/25 active:scale-95"
                    title={t("Add Normal Bot")}
                  >
                    <span>{t('Add Normal Bot')}</span>
                  </button>
                  <button
                    onClick={() => addBot('hard')}
                    className="text-xs flex items-center gap-1 text-white font-medium transition-all duration-200 bg-gradient-to-r from-amber-600 to-amber-500 px-1.5 py-0.5 rounded-lg border border-amber-400/30 hover:from-amber-500 hover:to-amber-400 hover:shadow-lg hover:shadow-amber-500/25 active:scale-95"
                    title={t("Add Hard Bot")}
                  >
                    <span>{t('Add Hard Bot')}</span>
                  </button>
                  <button
                    onClick={() => addBot('ai')}
                    className="text-xs flex items-center gap-1 text-white font-medium transition-all duration-200 bg-gradient-to-r from-violet-600 to-indigo-500 px-1.5 py-0.5 rounded-lg border border-violet-400/30 hover:from-violet-500 hover:to-indigo-400 hover:shadow-lg hover:shadow-violet-500/25 active:scale-95"
                    title={t("Add AI Bot")}
                  >
                    <span>{t('Add AI Bot')}</span>
                  </button>
                </div>
              )}
            </div>
            <ul className="space-y-2">
              {room.players.map((p, i) => (
                <li
                  key={p.sessionId}
                  className="bg-zinc-900/60 backdrop-blur-sm border border-zinc-700/40 rounded-xl flex flex-col"
                >
                  <div className="p-4 flex items-center justify-between">
                    <span className="font-medium flex items-center gap-2">
                      {p.name} {p.sessionId === sessionId && "(You)"}
                      {p.isBot && p.botClass === 'ai' && <Brain size={18} className="text-violet-400" />}
                      {p.isBot && p.botClass !== 'ai' && <Bot size={18} className={p.botClass === "hard" ? "text-amber-400" : "text-zinc-400"} />}
                      {p.isBot && p.botClass === 'ai' && p.hasApiKey && <Sparkles size={14} className="text-indigo-400" />}
                    </span>
                    <div className="flex items-center gap-2">
                      {p.isHost && (
                        <span className="text-xs bg-indigo-500/20 text-indigo-400 px-2 py-1 rounded-md">
                          {t("Host")}
                        </span>
                      )}
                      {!p.isConnected && !p.isBot && (
                        <span className="text-xs bg-red-500/20 text-red-400 px-2 py-1 rounded-md">
                          {t("Offline")}
                        </span>
                      )}
                      {isHost && !p.isHost && (
                        <button
                          onClick={() => kickPlayer(p.sessionId)}
                          className="p-0.5 text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors flex items-center justify-center"
                          title={t("Kick")}
                        >
                          <span className="text-sm leading-none font-bold">×</span>
                        </button>
                      )}
                    </div>
                  </div>
                  {p.isBot && p.botClass === 'ai' && isHost && (
                    <div className="px-4 pb-4 pt-3 border-t border-zinc-800/50 flex flex-col gap-2">
                      {/* Provider */}
                      <select
                        value={getBotConfig(p.sessionId).provider}
                        onChange={(e) => updateLocalBotConfig(p.sessionId, { provider: e.target.value as Provider })}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500/50"
                      >
                        <option value="gemini">Google Gemini (aistudio.google.com)</option>
                        <option value="openrouter">OpenRouter (openrouter.ai)</option>
                        <option value="groq">Groq (console.groq.com)</option>
                        <option value="nvidia">NVIDIA NIM (build.nvidia.com)</option>
                      </select>
                      {/* API Key */}
                      <input
                        type="password"
                        placeholder={
                          getBotConfig(p.sessionId).provider === 'gemini' ? 'Gemini API Key' :
                          getBotConfig(p.sessionId).provider === 'openrouter' ? 'OpenRouter API Key' :
                          getBotConfig(p.sessionId).provider === 'groq' ? 'Groq API Key' : 'NVIDIA NIM API Key'
                        }
                        value={getBotConfig(p.sessionId).apiKey}
                        onChange={(e) => updateLocalBotConfig(p.sessionId, { apiKey: e.target.value })}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500/50"
                      />
                      {/* Test key button */}
                      <button
                        onClick={() => handleTestApiKey(p.sessionId)}
                        disabled={!getBotConfig(p.sessionId).apiKey || testStatus[p.sessionId] === 'testing'}
                        className="w-full text-xs py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-indigo-500/50 transition-colors disabled:opacity-40"
                      >
                        {testStatus[p.sessionId] === 'testing' ? 'Testing...' : 'Test Key'}
                      </button>
                      {testStatus[p.sessionId] && testStatus[p.sessionId] !== 'testing' && (
                        <div className={`text-xs px-2 py-1 rounded-lg ${String(testStatus[p.sessionId]).startsWith('✅') ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10'}`}>
                          {testStatus[p.sessionId]}
                        </div>
                      )}
                      {/* Model selector */}
                      <select
                        value={getBotConfig(p.sessionId).model}
                        onChange={(e) => updateLocalBotConfig(p.sessionId, { model: e.target.value })}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500/50"
                      >
                        {PROVIDER_MODELS[getBotConfig(p.sessionId).provider].map(m => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                        <option value="custom">Custom model...</option>
                      </select>
                      {/* Custom model input */}
                      {getBotConfig(p.sessionId).model === 'custom' && (
                        <input
                          type="text"
                          placeholder="Enter model name"
                          value={getBotConfig(p.sessionId).customModel}
                          onChange={(e) => updateLocalBotConfig(p.sessionId, { customModel: e.target.value })}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm text-zinc-400 focus:outline-none focus:border-indigo-500/50"
                        />
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-3">
              <Settings size={16} className="text-zinc-400" />
              <h2 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                {t("Roles in play")} ({room.players.length} {t("Players")})
              </h2>
            </div>
            <div className="bg-zinc-900/60 backdrop-blur-sm border border-zinc-700/40 rounded-xl p-4 text-sm text-zinc-300">
              {room.players.length < 5 && t("Need at least 5 players")}
              {room.players.length === 5 && `${t("Merlin")}, ${t("Percival")}, ${t("Loyal Servant")}, ${t("Morgana")}, ${t("Assassin")}`}
              {room.players.length === 6 && `${t("Merlin")}, ${t("Percival")}, ${t("Loyal Servant")} x2, ${t("Morgana")}, ${t("Assassin")}`}
              {room.players.length === 7 && `${t("Merlin")}, ${t("Percival")}, ${t("Loyal Servant")} x2, ${t("Morgana")}, ${t("Assassin")}, ${t("Oberon")}`}
              {room.players.length === 8 && `${t("Merlin")}, ${t("Percival")}, ${t("Loyal Servant")} x3, ${t("Morgana")}, ${t("Assassin")}, ${t("Minion")}`}
              {room.players.length === 9 && `${t("Merlin")}, ${t("Percival")}, ${t("Loyal Servant")} x4, ${t("Morgana")}, ${t("Assassin")}, ${t("Mordred")}`}
              {room.players.length === 10 && `${t("Merlin")}, ${t("Percival")}, ${t("Loyal Servant")} x4, ${t("Morgana")}, ${t("Assassin")}, ${t("Oberon")}, ${t("Mordred")}`}
            </div>
          </section>
        </div>

        {isHost && (
          <div className="mt-8 pt-4 border-t border-zinc-700/30">
            <button
              onClick={() => startGame(devRequestedRole ? { [sessionId]: devRequestedRole } : undefined)}
              disabled={!canStart}
              className={`w-full flex items-center justify-center gap-2 py-4 rounded-xl font-medium transition-colors ${canStart
                ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                : "bg-zinc-800/70 text-zinc-500 cursor-not-allowed"
                }`}
            >
              <Play size={20} />
              {canStart ? t("Start Game") : t("Need 5-10 players")}
            </button>
          </div>
        )}
        {!isHost && (
          <div className="mt-8 pt-4 border-t border-zinc-700/30 text-center text-zinc-400 text-sm">
            {t("Waiting for host to start")}
          </div>
        )}
      </div>
    </div>
  );
}
