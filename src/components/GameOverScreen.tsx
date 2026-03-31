import { useState } from "react";
import { useGameStore } from "../store";
import { Crown, Skull, Shield, RefreshCw, Check, X, ChevronDown, ChevronUp, ShieldAlert, Users, Target, Medal } from "lucide-react";
import { cn } from "../utils/cn";
import { useTranslation } from "../utils/i18n";

export default function GameOverScreen() {
  const room = useGameStore((state) => state.room);
  const sessionId = useGameStore((state) => state.sessionId);
  const restartGame = useGameStore((state) => state.restartGame);
  const { t } = useTranslation();
  const [expandedQuest, setExpandedQuest] = useState<number | null>(null);
  const [expandedScore, setExpandedScore] = useState<string | null>(null);

  if (!room) return null;

  const { gameState, players } = room;
  const isEvilWin = gameState.winner === "evil";
  const isHost = players.find(p => p.isHost)?.sessionId === sessionId;

  const getPlayerName = (sid: string) => players.find(p => p.sessionId === sid)?.name || sid;
  const getPlayerRole = (sid: string) => players.find(p => p.sessionId === sid)?.role as string | null;
  const isPlayerEvil = (sid: string) => {
    const role = getPlayerRole(sid);
    return role ? ["Assassin", "Morgana", "Mordred", "Minion", "Oberon"].includes(role) : false;
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 flex flex-col max-w-md mx-auto p-6 pb-24">
      {/* Victory Banner */}
      <div className="flex flex-col items-center text-center space-y-4 pt-4 pb-8">
        <div
          className={cn(
            "w-20 h-20 rounded-full flex items-center justify-center mx-auto border-2",
            isEvilWin
              ? "bg-red-950/30 border-red-500/50"
              : "bg-blue-950/30 border-blue-500/50",
          )}
        >
          {isEvilWin ? (
            <Skull size={40} className="text-red-500" />
          ) : (
            <Shield size={40} className="text-blue-500" />
          )}
        </div>
        <h1
          className={cn(
            "text-3xl font-serif font-bold tracking-tight",
            isEvilWin ? "text-red-400" : "text-blue-400",
          )}
        >
          {isEvilWin ? t("Evil Wins!") : t("Good Wins!")}
        </h1>
        <p className="text-zinc-400 text-sm max-w-xs mx-auto">
          {isEvilWin
            ? gameState.assassinationTarget
              ? t("Merlin was assassinated!")
              : t("Evil sabotaged quests")
            : t("Merlin survived!")}
        </p>
      </div>

      {/* Scored Roles Section */}
      <section className="mb-8">
        <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">
          {t("Player Scores")}
        </h3>
        <div className="space-y-2">
          {(() => {
            const sortedPlayers = players.slice().sort((a, b) => {
              const scoreA = gameState.playerScores?.[a.sessionId] ?? 0;
              const scoreB = gameState.playerScores?.[b.sessionId] ?? 0;
              return scoreB - scoreA;
            });
            const uniqueScores = Array.from(new Set(sortedPlayers.map(p => gameState.playerScores?.[p.sessionId] ?? 0)));

            return sortedPlayers.map((p) => {
              const isEvil = [
                "Assassin", "Morgana", "Mordred", "Minion", "Oberon",
              ].includes(p.role as string);
              const isTarget = gameState.assassinationTarget === p.sessionId;
              const rawScore = gameState.playerScores?.[p.sessionId];
              const score = rawScore ?? "-";
              const details = gameState.playerScoreDetails?.[p.sessionId] || [];
              const isExpanded = expandedScore === p.sessionId;

              const rank = rawScore !== undefined ? uniqueScores.indexOf(rawScore) : -1;
              let scoreColor = "text-zinc-500"; // Default to dark grey
              if (rawScore !== undefined && rawScore > 0) {
                if (rank === 0) scoreColor = "text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]";
                else if (rank === 1) scoreColor = "text-slate-300 drop-shadow-[0_0_8px_rgba(203,213,225,0.4)]";
                else if (rank === 2) scoreColor = "text-amber-600 drop-shadow-[0_0_8px_rgba(217,119,6,0.4)]";
              } else if (rawScore === 0) {
                scoreColor = "text-zinc-600";
              }

            return (
              <div key={p.sessionId} className="rounded-xl border border-zinc-800 overflow-hidden">
                <button
                  onClick={() => setExpandedScore(isExpanded ? null : p.sessionId)}
                  className={cn(
                    "w-full flex items-center justify-between p-3 text-left transition-colors",
                    isEvil
                      ? "bg-red-950/10 hover:bg-red-950/20"
                      : "bg-blue-950/10 hover:bg-blue-950/20",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center border",
                        isEvil
                          ? "bg-red-900/20 border-red-800 text-red-500"
                          : "bg-blue-900/20 border-blue-800 text-blue-500",
                      )}
                    >
                      <span className="text-xs font-bold">
                        {p.name.charAt(0)}
                      </span>
                    </div>
                    <div>
                      <span
                        className={cn(
                          "font-medium block text-sm",
                          p.sessionId === sessionId && "text-white",
                        )}
                      >
                        {p.name} {p.sessionId === sessionId && "(You)"}
                      </span>
                      <span
                        className={cn(
                          "text-xs uppercase tracking-wider font-medium",
                          isEvil ? "text-red-400" : "text-blue-400",
                        )}
                      >
                        {t(p.role as string)}
                      </span>
                    </div>
                  </div>

                    <div className="flex items-center gap-3">
                      {isTarget && (
                        <div className="hidden sm:flex items-center gap-1 text-red-500 text-xs font-medium bg-red-950/50 px-2 py-1 rounded-md border border-red-900/50">
                          <Skull size={12} /> {t("Assassinated")}
                        </div>
                      )}

                      {rank >= 0 && rank <= 2 && rawScore !== undefined && rawScore > 0 && (
                        <div className={cn(
                          "flex items-center justify-center translate-y-[-1px]",
                          rank === 0 ? "text-amber-400" : rank === 1 ? "text-slate-300" : "text-amber-600"
                        )}>
                          <Medal size={20} className="drop-shadow-sm" />
                        </div>
                      )}

                      <div className={cn(
                        "flex flex-col items-end justify-center min-w-[40px] pr-2 transition-all duration-300",
                        scoreColor
                      )}>
                        <span className="text-2xl font-bold font-serif leading-none">{score}</span>
                        <span className="text-[9px] uppercase tracking-widest text-zinc-500">{t("Pts")}</span>
                      </div>
                      {isExpanded ? <ChevronUp size={16} className="text-zinc-500" /> : <ChevronDown size={16} className="text-zinc-500" />}
                    </div>
                </button>

                {isExpanded && details.length > 0 && (
                  <div className="border-t border-zinc-800/50 p-4 bg-zinc-900/40 text-sm space-y-2">
                    {details.map((detail, idx) => (
                      <div key={idx} className="flex justify-between items-center text-zinc-400">
                        <span>{t(detail.reason)}</span>
                        <span className={cn(
                          "font-medium tabular-nums",
                          detail.delta > 0 ? "text-emerald-400" : detail.delta < 0 ? "text-red-400" : "text-zinc-500"
                        )}>
                          {detail.delta > 0 ? "+" : ""}{detail.delta}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
            });
          })()}
        </div>
      </section>

      {/* Quest Timeline */}
      <section className="mb-8">
        <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-4">
          {t("Quest Timeline")}
        </h3>
        <div className="space-y-3">
          {gameState.quests.map((quest, qi) => {
            const isExpanded = expandedQuest === qi;
            const failed = quest.status === "fail";
            const success = quest.status === "success";
            const pending = quest.status === "pending";
            const failCount = Object.values(quest.votes).filter(v => !v).length;
            const historyForQuest = gameState.voteHistory.filter(h => h.questIndex === qi);

            // Find who failed the quest
            const failedBy = Object.entries(quest.votes)
              .filter(([, v]) => !v)
              .map(([sid]) => sid);

            return (
              <div key={qi} className="rounded-xl border border-zinc-800 overflow-hidden">
                {/* Quest Header — clickable */}
                <button
                  onClick={() => setExpandedQuest(isExpanded ? null : qi)}
                  className={cn(
                    "w-full flex items-center justify-between p-4 text-left transition-colors",
                    failed ? "bg-red-950/15" : success ? "bg-blue-950/15" : "bg-zinc-900/50"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-9 h-9 rounded-lg flex items-center justify-center border font-serif font-bold",
                      failed ? "bg-red-950/40 border-red-500/40 text-red-400"
                        : success ? "bg-blue-950/40 border-blue-500/40 text-blue-400"
                          : "bg-zinc-800 border-zinc-700 text-zinc-500"
                    )}>
                      {quest.teamSize}
                    </div>
                    <div>
                      <span className="font-medium text-sm block">
                        {t("Quest")} {qi + 1}
                        {quest.requiresTwoFails && <span className="text-zinc-500 text-xs ml-1">(2 {t("Fails")})</span>}
                      </span>
                      <span className={cn(
                        "text-xs font-medium uppercase tracking-wider",
                        failed ? "text-red-400" : success ? "text-blue-400" : "text-zinc-600"
                      )}>
                        {failed ? `${t("Quest Failed!")} · ${failCount} ${t("Fails")}` : success ? t("Quest Success!") : t("Pending")}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!pending && (
                      <span className="text-xs text-zinc-600">
                        {historyForQuest.length > 0 && `${historyForQuest.length} ${t("Attempt")}`}
                      </span>
                    )}
                    {!pending ? (
                      isExpanded ? <ChevronUp size={16} className="text-zinc-500" /> : <ChevronDown size={16} className="text-zinc-500" />
                    ) : null}
                  </div>
                </button>

                {/* Expanded Detail */}
                {isExpanded && !pending && (
                  <div className="border-t border-zinc-800 p-4 space-y-4 bg-zinc-950/50">

                    {/* Who failed the quest */}
                    {failed && failedBy.length > 0 && (
                      <div className="bg-red-950/20 border border-red-900/30 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <ShieldAlert size={14} className="text-red-400" />
                          <span className="text-xs font-medium text-red-400 uppercase tracking-wider">{t("Quest Votes")}</span>
                        </div>
                        <div className="space-y-1.5">
                          {Object.entries(quest.votes).map(([sid, vote]) => (
                            <div key={sid} className="flex items-center justify-between text-sm">
                              <span className={cn(
                                "font-medium",
                                isPlayerEvil(sid) ? "text-red-300" : "text-blue-300"
                              )}>
                                {getPlayerName(sid)}
                                <span className="text-zinc-600 text-xs ml-1">({t(getPlayerRole(sid) || "")})</span>
                              </span>
                              <span className={cn(
                                "text-xs font-medium px-2 py-0.5 rounded",
                                vote ? "bg-blue-950/50 text-blue-400" : "bg-red-950/50 text-red-400"
                              )}>
                                {vote ? t("Success") : t("Fail")}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Success quest votes (simpler) */}
                    {success && (
                      <div className="bg-blue-950/20 border border-blue-900/30 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <Target size={14} className="text-blue-400" />
                          <span className="text-xs font-medium text-blue-400 uppercase tracking-wider">{t("Quest Votes")}</span>
                        </div>
                        <div className="space-y-1.5">
                          {Object.entries(quest.votes).map(([sid, vote]) => (
                            <div key={sid} className="flex items-center justify-between text-sm">
                              <span className={cn(
                                "font-medium",
                                isPlayerEvil(sid) ? "text-red-300" : "text-blue-300"
                              )}>
                                {getPlayerName(sid)}
                                <span className="text-zinc-600 text-xs ml-1">({t(getPlayerRole(sid) || "")})</span>
                              </span>
                              <span className="text-xs font-medium px-2 py-0.5 rounded bg-blue-950/50 text-blue-400">
                                {t("Success")}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Team Vote History for this quest */}
                    {historyForQuest.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Users size={14} className="text-zinc-400" />
                          <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">{t("Team Votes")}</span>
                        </div>
                        <div className="space-y-2">
                          {historyForQuest.map((h, hi) => {
                            const approves = Object.values(h.votes).filter(v => v).length;
                            const rejects = Object.values(h.votes).filter(v => !v).length;
                            const leaderName = players[h.leaderIndex]?.name || "?";
                            return (
                              <div key={hi} className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-xs text-zinc-400">
                                    <Crown size={10} className="inline text-amber-500 mr-1" />
                                    {leaderName} · {t("Attempt")} {hi + 1}
                                  </span>
                                  <span className={cn(
                                    "text-xs font-medium px-2 py-0.5 rounded",
                                    h.approved ? "bg-emerald-950/50 text-emerald-400" : "bg-red-950/50 text-red-400"
                                  )}>
                                    {h.approved ? t("Team Approved") : t("Team Rejected")} ({approves} / {rejects})
                                  </span>
                                </div>
                                <div className="flex flex-wrap gap-x-3 gap-y-1">
                                  {players.map(p => {
                                    const voted = p.sessionId in h.votes;
                                    const approved = h.votes[p.sessionId];
                                    const onTeam = h.proposedTeam.includes(p.sessionId);
                                    if (!voted) return null;
                                    return (
                                      <div key={p.sessionId} className="flex items-center gap-1 text-xs">
                                        {approved ? (
                                          <Check size={10} className="text-emerald-400" />
                                        ) : (
                                          <X size={10} className="text-red-400" />
                                        )}
                                        <span className={cn(
                                          onTeam ? "font-medium text-zinc-200" : "text-zinc-500",
                                        )}>
                                          {p.name}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                                {/* Show proposed team */}
                                <div className="mt-2 flex items-center gap-1 text-xs text-zinc-600">
                                  <span>{t("Team")}:</span>
                                  {h.proposedTeam.map(sid => (
                                    <span key={sid} className={cn(
                                      "px-1.5 py-0.5 rounded bg-zinc-800",
                                      isPlayerEvil(sid) ? "text-red-400" : "text-blue-400"
                                    )}>
                                      {getPlayerName(sid)}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Actions */}
      <div className="sticky bottom-0 bg-zinc-950/90 backdrop-blur-xl pt-4 pb-2 -mx-6 px-6 border-t border-zinc-900">
        {isHost ? (
          <button
            onClick={restartGame}
            className="w-full py-4 rounded-xl font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors flex items-center justify-center gap-2"
          >
            <RefreshCw size={20} /> {t("Play Again")}
          </button>
        ) : (
          <p className="text-zinc-500 text-sm text-center py-4">
            {t("Waiting for host to continue...")}
          </p>
        )}
      </div>
    </div>
  );
}
