import { useState, useEffect } from "react";
import { useGameStore } from "../store";
import { Check, X, Crown, Users, Target, ShieldAlert, LogOut, History, Eye, Shield, Skull, MessageSquare, Bot, Sparkles, Loader2 } from "lucide-react";
import { cn } from "../utils/cn";
import { useTranslation } from "../utils/i18n";
import VoteHistoryHeader from "./VoteHistoryHeader";
import VoteHistoryDetails from "./VoteHistoryDetails";

const BOT_LOADING_WORDS = [
  "Scheming", "Pondering", "Napping", "Caffeinating",
  "Conspiring", "Buffering", "Philosophizing", "Daydreaming",
  "Overthinking", "Manifesting", "Procrastinating", "Plotting",
  "Vibing", "Computing", "Calculating", "Meditating", "Strategizing",
  "Deliberating", "Hesitating", "Snoozing",
];

export default function GameScreen() {
  const room = useGameStore((state) => state.room);
  const sessionId = useGameStore((state) => state.sessionId);
  const proposeTeam = useGameStore((state) => state.proposeTeam);
  const voteTeam = useGameStore((state) => state.voteTeam);
  const voteQuest = useGameStore((state) => state.voteQuest);
  const continueVoteReveal = useGameStore((state) => state.continueVoteReveal);
  const continueQuestResult = useGameStore((state) => state.continueQuestResult);
  const { t } = useTranslation();

  const [selectedTeam, setSelectedTeam] = useState<string[]>([]);
  const [viewingHistoryIndex, setViewingHistoryIndex] = useState<number | null>(null);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [loadingWordIndex, setLoadingWordIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setLoadingWordIndex(i => (i + 1) % BOT_LOADING_WORDS.length);
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  if (!room) return null;

  const { gameState, status, players } = room;
  const currentQuest = gameState.quests[gameState.currentQuestIndex];
  const isLeader = players[gameState.leaderIndex].sessionId === sessionId;
  const me = players.find((p) => p.sessionId === sessionId);

  const isEvil = me ? [
    "Assassin",
    "Morgana",
    "Mordred",
    "Minion",
    "Oberon",
  ].includes(me.role as string) : false;

  let info: string[] = [];
  if (me?.role === "Merlin") {
    info = room.players
      .filter((p) =>
        ["Assassin", "Morgana", "Minion", "Oberon"].includes(p.role as string),
      )
      .map((p) => p.name);
  } else if (me?.role === "Percival") {
    info = room.players
      .filter((p) => ["Merlin", "Morgana"].includes(p.role as string))
      .map((p) => p.name);
  } else if (isEvil && me?.role !== "Oberon") {
    info = room.players
      .filter(
        (p) =>
          ["Assassin", "Morgana", "Mordred", "Minion"].includes(
            p.role as string,
          ) && p.sessionId !== sessionId,
      )
      .map((p) => p.name);
  }

  const togglePlayer = (id: string) => {
    if (status !== "team_building" || !isLeader) return;

    if (selectedTeam.includes(id)) {
      setSelectedTeam(selectedTeam.filter((p) => p !== id));
    } else if (selectedTeam.length < currentQuest.teamSize) {
      setSelectedTeam([...selectedTeam, id]);
    }
  };

  const handlePropose = () => {
    if (selectedTeam.length === currentQuest.teamSize) {
      proposeTeam(selectedTeam);
      setSelectedTeam([]);
    }
  };

  const hasVotedTeam = sessionId in gameState.teamVotes;
  const hasVotedQuest = sessionId in currentQuest.votes;
  const isOnTeam = gameState.proposedTeam.includes(sessionId);

  const viewingVote = status === 'team_vote_reveal' ? gameState.voteHistory[gameState.voteHistory.length - 1] : null;
  const isViewingHistory = viewingHistoryIndex !== null;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 flex flex-col max-w-md mx-auto">
      <VoteHistoryHeader
        title={`${t("Mission")} ${gameState.currentQuestIndex + 1}`}
        viewingHistoryIndex={viewingHistoryIndex}
        setViewingHistoryIndex={setViewingHistoryIndex}
        onViewRole={() => setShowRoleModal(true)}
      />

      {isViewingHistory ? (
        <VoteHistoryDetails
          viewingHistoryIndex={viewingHistoryIndex}
          onBack={() => setViewingHistoryIndex(null)}
        />
      ) : (
        <>
          <main className="flex-1 p-6 space-y-8">
            {/* Status Banner */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center">
              {status === "team_building" ? (
                <>
                  <Crown className="w-8 h-8 mx-auto mb-3 text-amber-500" />
                  <h2 className="text-lg font-medium mb-1">
                    {isLeader
                      ? t("You are the Leader")
                      : `${players[gameState.leaderIndex].name} ${t("is choosing the team")}`}
                  </h2>
                  <p className="text-zinc-400 text-sm">
                    {isLeader
                      ? `${t("Select team members")} (${currentQuest.teamSize})`
                      : t("Waiting for leader")}
                  </p>
                </>
              ) : status === "team_voting" ? (
                <>
                  <Users className="w-8 h-8 mx-auto mb-3 text-indigo-400" />
                  <h2 className="text-lg font-medium mb-1">{t("Vote on Team")}</h2>
                  <p className="text-zinc-400 text-sm">
                    {t("Do you approve of this team?")}
                  </p>
                </>
              ) : status === "team_vote_reveal" ? (
                <>
                  <Users className="w-8 h-8 mx-auto mb-3 text-indigo-400" />
                  <h2 className="text-lg font-medium mb-1">{t("Vote Results")}</h2>
                  <p className="text-sm text-zinc-400">
                    <span className={viewingVote?.approved ? "text-emerald-400" : "text-red-400"}>
                      {viewingVote?.approved ? t("Team Approved") : t("Team Rejected")}
                    </span>
                  </p>
                </>
              ) : status === "quest_voting" ? (
                <>
                  <Target className="w-8 h-8 mx-auto mb-3 text-emerald-400" />
                  <h2 className="text-lg font-medium mb-1">{t("Quest Phase")}</h2>
                  <p className="text-zinc-400 text-sm">
                    {isOnTeam
                      ? t("You are on the quest. Cast your vote.")
                      : t("Waiting for team to complete quest...")}
                  </p>
                </>
              ) : status === "quest_result" ? (
                (() => {
                  const quest = gameState.quests[gameState.currentQuestIndex];
                  const failed = quest.status === 'fail';
                  const failCount = Object.values(quest.votes).filter(v => !v).length;
                  return (
                    <>
                      <div className={cn(
                        "w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3 border-2",
                        failed ? "bg-red-950/30 border-red-500/50" : "bg-blue-950/30 border-blue-500/50"
                      )}>
                        {failed ? <ShieldAlert size={28} className="text-red-500" /> : <Shield size={28} className="text-blue-500" />}
                      </div>
                      <h2 className={cn(
                        "text-xl font-serif font-bold mb-1",
                        failed ? "text-red-400" : "text-blue-400"
                      )}>
                        {failed ? t("Quest Failed!") : t("Quest Success!")}
                      </h2>
                      <p className="text-zinc-400 text-sm">
                        {failCount > 0
                          ? `${failCount} ${t("fail votes cast")}`
                          : t("All votes were for success")}
                      </p>
                    </>
                  );
                })()
              ) : null}
            </div>

            {/* Player List */}
            <section>
              <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">
                {t("Players")}
              </h3>
              <div className="space-y-2">
                {players.map((p, i) => {
                  const isSelected = status === "team_building"
                    ? selectedTeam.includes(p.sessionId)
                    : gameState.proposedTeam.includes(p.sessionId);

                  const isCurrentLeader = i === gameState.leaderIndex;

                  return (
                    <button
                      key={p.sessionId}
                      onClick={() => togglePlayer(p.sessionId)}
                      disabled={status !== "team_building" || !isLeader}
                      className={cn(
                        "w-full flex items-center justify-between p-4 rounded-xl border transition-all text-left",
                        isSelected
                          ? "bg-indigo-950/30 border-indigo-500/50 text-indigo-100"
                          : "bg-zinc-900 border-zinc-800 text-zinc-300",
                        status === "team_building" &&
                        isLeader &&
                        !isSelected &&
                        "hover:border-zinc-700",
                        status === "team_building" && isLeader && "cursor-pointer",
                        status !== "team_building" || !isLeader
                          ? "cursor-default"
                          : "",
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center border",
                            isSelected
                              ? "bg-indigo-600 border-indigo-500 text-white"
                              : "bg-zinc-800 border-zinc-700 text-zinc-500",
                          )}
                        >
                          {isSelected ? (
                            <Check size={16} />
                          ) : (
                            <span className="text-xs">{p.name.charAt(0)}</span>
                          )}
                        </div>
                        <span className="font-medium">
                          {p.name} {p.sessionId === sessionId && "(You)"}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {p.isBot && p.hasApiKey && (
                          <Sparkles size={13} className="text-indigo-400" />
                        )}
                        {isCurrentLeader && (
                          <Crown size={16} className="text-amber-500" />
                        )}
                        {status === "team_voting" && p.isBot && p.hasApiKey &&
                          !(p.sessionId in gameState.teamVotes) && (
                            <span className="text-xs bg-indigo-950/50 text-indigo-400 px-2 py-1 rounded-md flex items-center gap-1">
                              <Loader2 size={10} className="animate-spin" />
                              {BOT_LOADING_WORDS[loadingWordIndex]}
                            </span>
                          )}
                        {status === "team_voting" &&
                          p.sessionId in gameState.teamVotes && (
                            <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-1 rounded-md">
                              {t("Voted")}
                            </span>
                          )}
                        {status === "team_vote_reveal" && viewingVote && (
                          p.sessionId in viewingVote.votes && (
                            <div className={cn(
                              "flex items-center gap-1 px-2 py-1 rounded-md text-xs",
                              viewingVote.votes[p.sessionId] ? "bg-emerald-950/50 text-emerald-400" : "bg-red-950/50 text-red-400"
                            )}>
                              {viewingVote.votes[p.sessionId] ? <Check size={12} /> : <X size={12} />}
                              {viewingVote.votes[p.sessionId] ? t("Approve") : t("Reject")}
                            </div>
                          )
                        )}
                        {status === "quest_voting" && p.isBot && p.hasApiKey &&
                          gameState.proposedTeam.includes(p.sessionId) &&
                          !(p.sessionId in currentQuest.votes) && (
                            <span className="text-xs bg-indigo-950/50 text-indigo-400 px-2 py-1 rounded-md flex items-center gap-1">
                              <Loader2 size={10} className="animate-spin" />
                              {BOT_LOADING_WORDS[loadingWordIndex]}
                            </span>
                          )}
                        {status === "quest_voting" &&
                          gameState.proposedTeam.includes(p.sessionId) &&
                          p.sessionId in currentQuest.votes && (
                            <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-1 rounded-md">
                              {t("Voted")}
                            </span>
                          )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Bot Opinions Dialog */}
            {gameState.botOpinions && gameState.botOpinions.length > 0 && (
              <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 mt-8">
                <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <MessageSquare size={14} /> {t("Bot Opinions")}
                </h3>
                <div className="space-y-4">
                  {gameState.botOpinions.map((opinion, idx) => {
                    const botPlayer = players.find(p => p.sessionId === opinion.botId);
                    return (
                      <div key={idx} className="flex gap-3">
                        <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
                          <Bot size={14} className="text-zinc-400" />
                        </div>
                        <div className="flex-1 bg-zinc-950/50 rounded-xl p-3 border border-zinc-800/50">
                          <div className="text-xs font-medium text-indigo-400 mb-1">{botPlayer?.name || "Bot"}</div>
                          <div className={cn("text-sm", opinion.isError ? "text-red-400" : "text-zinc-300")}>
                            {opinion.text}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </main>

          {/* Action Bar */}
          <div className="p-6 border-t border-zinc-900 bg-zinc-950/80 backdrop-blur-xl sticky bottom-0 z-10">
            {status === "team_vote_reveal" && isLeader && (
              <button
                onClick={continueVoteReveal}
                className="w-full py-4 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white"
              >
                {t("Continue")}
              </button>
            )}

            {status === "team_vote_reveal" && !isLeader && (
              <div className="text-center text-zinc-500 py-4 font-medium">
                {t("Waiting for leader to continue...")}
              </div>
            )}

            {status === "quest_result" && isLeader && (
              <button
                onClick={continueQuestResult}
                className="w-full py-4 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white"
              >
                {t("Continue")}
              </button>
            )}

            {status === "quest_result" && !isLeader && (
              <div className="text-center text-zinc-500 py-4 font-medium">
                {t("Waiting for leader to continue...")}
              </div>
            )}

            {status === "team_building" && isLeader && (
              <button
                onClick={handlePropose}
                disabled={selectedTeam.length !== currentQuest.teamSize}
                className={cn(
                  "w-full py-4 rounded-xl font-medium transition-colors flex items-center justify-center gap-2",
                  selectedTeam.length === currentQuest.teamSize
                    ? "bg-indigo-600 hover:bg-indigo-500 text-white"
                    : "bg-zinc-800 text-zinc-500 cursor-not-allowed",
                )}
              >
                {t("Propose Team")} ({selectedTeam.length}/{currentQuest.teamSize})
              </button>
            )}

            {status === "team_building" && !isLeader && (
              <div className="text-center text-zinc-500 py-4 font-medium">
                {`${t("Leader is selecting")} ${gameState.proposedTeam.length}/${currentQuest.teamSize}`}
              </div>
            )}

            {status === "team_voting" && !hasVotedTeam && (
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => voteTeam(false)}
                  className="py-4 rounded-xl font-medium bg-red-950/30 border border-red-500/50 text-red-400 hover:bg-red-900/40 transition-colors flex items-center justify-center gap-2"
                >
                  <X size={20} /> {t("Reject")}
                </button>
                <button
                  onClick={() => voteTeam(true)}
                  className="py-4 rounded-xl font-medium bg-emerald-950/30 border border-emerald-500/50 text-emerald-400 hover:bg-emerald-900/40 transition-colors flex items-center justify-center gap-2"
                >
                  <Check size={20} /> {t("Approve")}
                </button>
              </div>
            )}

            {status === "team_voting" && hasVotedTeam && (
              <div className="text-center text-zinc-500 py-4 font-medium">
                {t("Waiting for others to vote...")}
              </div>
            )}

            {status === "quest_voting" && isOnTeam && !hasVotedQuest && (
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => voteQuest(false)}
                  disabled={
                    ![
                      "Assassin",
                      "Morgana",
                      "Mordred",
                      "Minion",
                      "Oberon",
                    ].includes(me?.role as string)
                  }
                  className={cn(
                    "py-4 rounded-xl font-medium border transition-colors flex items-center justify-center gap-2",
                    ["Assassin", "Morgana", "Mordred", "Minion", "Oberon"].includes(
                      me?.role as string,
                    )
                      ? "bg-red-950/30 border-red-500/50 text-red-400 hover:bg-red-900/40"
                      : "bg-zinc-900 border-zinc-800 text-zinc-600 cursor-not-allowed",
                  )}
                >
                  <ShieldAlert size={20} /> {t("Fail")}
                </button>
                <button
                  onClick={() => voteQuest(true)}
                  className="py-4 rounded-xl font-medium bg-blue-950/30 border border-blue-500/50 text-blue-400 hover:bg-blue-900/40 transition-colors flex items-center justify-center gap-2"
                >
                  <Target size={20} /> {t("Success")}
                </button>
              </div>
            )}

            {status === "quest_voting" && (!isOnTeam || hasVotedQuest) && (
              <div className="text-center text-zinc-500 py-4 font-medium">
                {t("Waiting for team to complete quest...")}
              </div>
            )}
          </div>
        </>
      )}

      {/* Role Info Modal */}
      {showRoleModal && me && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-8 max-w-sm w-full relative">
            <button
              onClick={() => setShowRoleModal(false)}
              className="absolute top-4 right-4 p-2 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <X size={20} />
            </button>

            <div className="flex flex-col items-center gap-6">
              {isEvil ? (
                <Skull size={64} className="text-red-500" />
              ) : (
                <Shield size={64} className="text-blue-500" />
              )}

              <div className="text-center">
                <h2
                  className={`text-4xl font-serif font-bold mb-2 ${isEvil ? "text-red-400" : "text-blue-400"}`}
                >
                  {t(me.role as string)}
                </h2>
                <p className="text-zinc-400 font-medium uppercase tracking-widest text-xs">
                  {isEvil ? t("Minion of Mordred") : t("Loyal Servant of Arthur")}
                </p>
              </div>

              {info.length > 0 && (
                <div className="w-full mt-4 p-4 bg-black/40 rounded-xl border border-white/5">
                  <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3 text-center">
                    {me.role === "Merlin"
                      ? t("You see evil:")
                      : me.role === "Percival"
                        ? t("Merlin or Morgana:")
                        : t("Your fellow evil:")}
                  </h3>
                  <ul className="space-y-2 text-center">
                    {info.map((name) => (
                      <li key={name} className="font-medium text-zinc-300">
                        {name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
