import { useGameStore } from '../store';

export const translations = {
  en: {
    // Roles
    'Merlin': 'Merlin',
    'Assassin': 'Assassin',
    'Percival': 'Percival',
    'Morgana': 'Morgana',
    'Mordred': 'Mordred',
    'Oberon': 'Oberon',
    'Loyal Servant': 'Loyal Servant of Arthur',
    'Minion': 'Minion of Mordred',
    'Loyal Servant of Arthur': 'Loyal Servant of Arthur',
    'Minion of Mordred': 'Minion of Mordred',

    // Join Screen
    'Enter Passphrase': 'Enter Passphrase',
    'Enter your name': 'Enter your name',
    'Enter room code': 'Enter room code',
    'Join Room': 'Join Room',
    'Create New Room': 'Create New Room',
    'A Game of Hidden Loyalty': 'A Game of Hidden Loyalty',

    // Lobby Screen
    'Room': 'Room',
    'Players': 'Players',
    'Waiting for host to start': 'Waiting for host to start...',
    'Start Game': 'Start Game',
    'Add Bot': 'Add Bot',
    'Add Normal Bot': '+ Normal Bot',
    'Add Hard Bot': '+ Hard Bot',
    'Add AI Bot': '+ AI Agent',
    'Normal Bot': 'Normal Bot',
    'Hard Bot': 'Hard Bot',
    'AI Bot': 'AI Agent',
    'Leave Room': 'Leave Room',
    'End Game': 'End Game',
    'Kick': 'Kick',
    'Host': 'Host',
    'Bot': 'Bot',
    'Roles in play': 'Roles in play',

    // Role Reveal
    'Your Role': 'Your Role',
    'Keep this secret from others': 'Keep this secret from others',
    'Tap to Reveal': 'Tap to Reveal',
    'You see evil:': 'You see evil:',
    'Merlin or Morgana:': 'Merlin or Morgana:',
    'Your fellow evil:': 'Your fellow evil:',
    'Everyone is Ready': 'Everyone is Ready',
    'Waiting for host to continue...': 'Waiting for host to continue...',

    // Team Building
    'Mission': 'Mission',
    'Fails': 'Fails',
    'Select team members': 'Select team members',
    'Propose Team': 'Propose Team',
    'Waiting for leader': 'Waiting for leader to propose a team...',
    'Leader': 'Leader',
    'Vote Track': 'Vote Track',

    // Voting
    'Vote on Team': 'Vote on Team',
    'Approve': 'Approve',
    'Reject': 'Reject',
    'Waiting for others to vote...': 'Waiting for others to vote...',
    'Team Approved': 'Team Approved',
    'Team Rejected': 'Team Rejected',
    'Continue': 'Continue',
    'Vote History': 'Vote History',
    'Attempt': 'Attempt',
    'Back to Current Game': 'Back to Current Game',
    'Back to Assassination': 'Back to Assassination',

    // Quest
    'Quest Phase': 'Quest Phase',
    'Success': 'Success',
    'Fail': 'Fail',
    'Waiting for team to complete quest...': 'Waiting for team to complete quest...',

    // Assassination
    'Assassin Phase': 'Assassin Phase',
    'Assassinate Merlin': 'Assassinate Merlin',
    'Select Merlin': 'Select who you think is Merlin',
    'Confirm Assassination': 'Confirm Assassination',
    'Waiting for Assassin...': 'Waiting for Assassin to make a choice...',

    // Game Over
    'Game Over': 'Game Over',
    'Good Wins!': 'Good Wins!',
    'Evil Wins!': 'Evil Wins!',
    'Merlin was assassinated!': 'Merlin was assassinated!',
    'Merlin survived!': 'Merlin survived!',
    'Play Again': 'Play Again',

    // Idle Warning
    'Room Inactive': 'Room Inactive',
    'This room will close due to inactivity.': 'This room will close due to inactivity.',
    "I'm still here": "I'm still here",
    'Cancel': 'Cancel',
    'Waiting for players...': 'Waiting for players...',

    // Room Browser
    'Browse Rooms': 'Browse Rooms',
    'Available Rooms': 'Available Rooms',
    'No rooms available': 'No rooms available',
    'Create one from the Join tab': 'Create one from the Join tab',
    'Waiting': 'Waiting',
    'In Game': 'In Game',
    'Room Code': 'Room Code',
    'Your Identity': 'Your Identity',

    // GameScreen extras
    'is choosing the team': 'is choosing the team',
    'Do you approve of this team?': 'Do you approve of this team?',
    'Vote Results': 'Vote Results',
    'You are on the quest. Cast your vote.': 'You are on the quest. Cast your vote.',
    'Voted': 'Voted',
    'Waiting for leader to continue...': 'Waiting for leader to continue...',
    'You are the Leader': 'You are the Leader',
    'Leader is selecting': 'Leader has selected',
    'Bot Opinions': 'Bot chats',

    // AssassinScreen extras
    'Good completed 3 quests': 'Good has completed 3 quests, but Evil has one last chance. The Assassin must find Merlin.',
    'Bot assassin hint': 'The Assassin is a bot. As a fellow agent of Evil, you must choose the target!',
    'If Merlin is killed': 'If they kill Merlin, Evil wins.',

    // GameOverScreen extras
    'Evil sabotaged quests': 'Evil successfully sabotaged 3 quests or 5 teams were rejected.',
    'Assassinated': 'Assassinated',

    // LobbyScreen extras
    'Offline': 'Offline',
    'Need at least 5 players': 'Need at least 5 players to see roles.',
    'Need 5-10 players': 'Need 5-10 players',

    // Quest Result
    'Quest Result': 'Quest Result',
    'Quest Success!': 'Quest Success!',
    'Quest Failed!': 'Quest Failed!',
    'fail votes cast': 'fail vote(s) were cast',
    'All votes were for success': 'All votes were for success!',

    // Game Over Review
    'Game Review': 'Game Review',
    'Quest Timeline': 'Quest Timeline',
    'Quest': 'Quest',
    'Team': 'Team',
    'Result': 'Result',
    'Pending': 'Pending',
    'Team Votes': 'Team Votes',
    'Quest Votes': 'Quest Votes',
    'failed the quest': 'failed the quest',
    // Score Reasons
    'Base Score': 'Base Score',
    'Faction Win': 'Faction Win (+1)',
    'Faction Loss': 'Faction Loss (-1)',
    'Merlin Assassinated': 'Merlin Assassinated (-3)',
    'Assassinated Merlin': 'Assassinated Merlin (+3)',
    'Score Max Cap': 'Score Max Cap',
    'Score Min Cap': 'Score Min Cap',
    'Merlin Brought Evil': 'Merlin: Brought Evil Member (-2)',
    'Percival Brought Morgana': 'Percival: Brought Morgana (-1)',
    'Percival Brought Evil': 'Percival: Brought Evil Member (-2)',
    'Good Proposer Brought Evil': 'Good Player: Brought Evil Member (-1)',

    'AI Mind Log': 'AI Mind Log',
    'Copy Log': 'Copy Log',
    'Copied!': 'Copied!',
  },
  zh: {
    // Roles
    'Merlin': '梅林',
    'Assassin': '刺客',
    'Percival': '派西维尔',
    'Morgana': '莫甘娜',
    'Mordred': '莫德雷德',
    'Oberon': '奥伯伦',
    'Loyal Servant': '亚瑟的忠臣',
    'Minion': '莫德雷德的爪牙',
    'Loyal Servant of Arthur': '亚瑟的忠臣',
    'Minion of Mordred': '莫德雷德的爪牙',

    // Join Screen
    'Enter Passphrase': '输入暗号',
    'Enter your name': '输入你的名字',
    'Enter room code': '输入房间号',
    'Join Room': '加入房间',
    'Create New Room': '创建新房间',
    'A Game of Hidden Loyalty': '隐藏忠诚的游戏',

    // Lobby Screen
    'Room': '房间',
    'Players': '玩家',
    'Waiting for host to start': '等待房主开始游戏...',
    'Start Game': '开始游戏',
    'Add Bot': '添加机器人',
    'Add Normal Bot': '+ 普通机器人',
    'Add Hard Bot': '+ 困难机器人',
    'Add AI Bot': '+ 智能体',
    'Normal Bot': '普通机器人',
    'Hard Bot': '困难机器人',
    'AI Bot': '智能体',
    'Leave Room': '离开房间',
    'End Game': '结束游戏',
    'Kick': '踢出',
    'Host': '房主',
    'Bot': '机器人',
    'Roles in play': '本局角色',

    // Role Reveal
    'Your Role': '你的角色',
    'Keep this secret from others': '请向其他人保密',
    'Tap to Reveal': '点击翻开',
    'You see evil:': '你看到的坏人是：',
    'Merlin or Morgana:': '梅林或莫甘娜：',
    'Your fellow evil:': '你的邪恶同伴：',
    'Everyone is Ready': '所有人都准备好了',
    'Waiting for host to continue...': '等待房主继续...',

    // Team Building
    'Mission': '任务',
    'Fails': '次失败',
    'Select team members': '选择队伍成员',
    'Propose Team': '提议队伍',
    'Waiting for leader': '等待队长提议队伍...',
    'Leader': '队长',
    'Vote Track': '发车失败次数',

    // Voting
    'Vote on Team': '队伍投票',
    'Approve': '赞成',
    'Reject': '反对',
    'Waiting for others to vote...': '等待其他人投票...',
    'Team Approved': '队伍已通过',
    'Team Rejected': '队伍被否决',
    'Continue': '继续',
    'Vote History': '投票历史',
    'Attempt': '尝试',
    'Back to Current Game': '返回当前游戏',
    'Back to Assassination': '返回刺杀',

    // Quest
    'Quest Phase': '任务阶段',
    'Success': '任务成功',
    'Fail': '任务失败',
    'Waiting for team to complete quest...': '等待队伍完成任务...',

    // Assassination
    'Assassin Phase': '刺杀阶段',
    'Assassinate Merlin': '刺杀梅林',
    'Select Merlin': '选择你认为是梅林的玩家',
    'Confirm Assassination': '确认刺杀',
    'Waiting for Assassin...': '等待刺客做出选择...',

    // Game Over
    'Game Over': '游戏结束',
    'Good Wins!': '正义阵营胜利！',
    'Evil Wins!': '邪恶阵营胜利！',
    'Merlin was assassinated!': '梅林被刺杀了！',
    'Merlin survived!': '梅林存活了下来！',
    'Play Again': '再玩一次',

    // Idle Warning
    'Room Inactive': '房间不活跃',
    'This room will close due to inactivity.': '房间即将因不活跃而关闭。',
    "I'm still here": '我还在',
    'Cancel': '取消',
    'Waiting for players...': '等待玩家加入...',

    // Room Browser
    'Browse Rooms': '浏览房间',
    'Available Rooms': '可加入的房间',
    'No rooms available': '暂无房间',
    'Create one from the Join tab': '去"加入房间"页创建一个',
    'Waiting': '等待中',
    'In Game': '游戏中',
    'Room Code': '房间号',
    'Your Identity': '你的名字',

    // GameScreen extras
    'is choosing the team': '正在选择队伍',
    'Do you approve of this team?': '你同意这个队伍吗？',
    'Vote Results': '投票结果',
    'You are on the quest. Cast your vote.': '你在任务队伍中，请投票。',
    'Voted': '已投票',
    'Waiting for leader to continue...': '等待队长继续...',
    'You are the Leader': '你是队长',
    'Leader is selecting': '队长已选择',
    'Bot Opinions': '机器人发言',

    // AssassinScreen extras
    'Good completed 3 quests': '正义阵营已完成3个任务，但邪恶阵营还有最后一次机会。刺客必须找出梅林。',
    'Bot assassin hint': '刺客是机器人。作为邪恶阵营的成员，你必须选择目标！',
    'If Merlin is killed': '如果刺客杀死梅林，邪恶阵营获胜。',

    // GameOverScreen extras
    'Evil sabotaged quests': '邪恶阵营破坏了3个任务或5次组队被否决。',
    'Assassinated': '被刺杀',

    // LobbyScreen extras
    'Offline': '离线',
    'Need at least 5 players': '需要至少5名玩家才能查看角色。',
    'Need 5-10 players': '需要5-10名玩家',

    // Quest Result
    'Quest Result': '任务结果',
    'Quest Success!': '任务成功！',
    'Quest Failed!': '任务失败！',
    'fail votes cast': '张失败票',
    'All votes were for success': '所有投票均为成功！',

    // Game Over Review
    'Game Review': '游戏复盘',
    'Quest Timeline': '任务时间线',
    'Quest': '任务',
    'Team': '队伍',
    'Result': '结果',
    'Pending': '未完成',
    'Team Votes': '组队投票',
    'Quest Votes': '任务投票',
    'failed the quest': '破坏了任务',
    // Score Reasons
    'Base Score': '初始基准分',
    'Tie-breaker Win Bonus': '并列同分阵营获胜加成 (+1)',
    'Faction Win': '阵营获胜 (+1)',
    'Faction Loss': '阵营落败 (-1)',
    'Merlin Assassinated': '错保梅林被刺杀 (-3)',
    'Assassinated Merlin': '绝杀梅林加成 (+3)',
    'Score Max Cap': '触发最高分上限',
    'Score Min Cap': '触发最低分下限',
    'Merlin Brought Evil': '梅林：带坏人上车 (-2)',
    'Percival Brought Morgana': '派西维尔：带莫甘娜上车 (-1)',
    'Percival Brought Evil': '派西维尔：带其他坏人上车 (-2)',
    'Good Proposer Brought Evil': '好人：带坏人上车 (-1)',
    
    'Quest 1 Success': '任务 1 成功',
    'Quest 2 Success': '任务 2 成功',
    'Quest 3 Success': '任务 3 成功',
    'Quest 4 Success': '任务 4 成功',
    'Quest 5 Success': '任务 5 成功',
    
    'Quest 1 Fail (Off Team)': '任务 1 失败 (未在队伍中)',
    'Quest 2 Fail (Off Team)': '任务 2 失败 (未在队伍中)',
    'Quest 3 Fail (Off Team)': '任务 3 失败 (未在队伍中)',
    'Quest 4 Fail (Off Team)': '任务 4 失败 (未在队伍中)',
    'Quest 5 Fail (Off Team)': '任务 5 失败 (未在队伍中)',
    
    'Quest 1 Fail (Approved)': '任务 1 失败 (错投赞成发车)',
    'Quest 2 Fail (Approved)': '任务 2 失败 (错投赞成发车)',
    'Quest 3 Fail (Approved)': '任务 3 失败 (错投赞成发车)',
    'Quest 4 Fail (Approved)': '任务 4 失败 (错投赞成发车)',
    'Quest 5 Fail (Approved)': '任务 5 失败 (错投赞成发车)',
    
    'Quest 1 Fail (Rejected)': '任务 1 失败 (明智地投了反对)',
    'Quest 2 Fail (Rejected)': '任务 2 失败 (明智地投了反对)',
    'Quest 3 Fail (Rejected)': '任务 3 失败 (明智地投了反对)',
    'Quest 4 Fail (Rejected)': '任务 4 失败 (明智地投了反对)',
    'Quest 5 Fail (Rejected)': '任务 5 失败 (明智地投了反对)',

    'AI Mind Log': 'AI 思维日志',
    'Copy Log': '复制日志',
    'Copied!': '已复制！',
  }
};

export function useTranslation() {
  const language = useGameStore(state => state.language);

  const t = (key: keyof typeof translations.en | string): string => {
    // If key exists in translation dictionary, return it. Otherwise return the key itself.
    const dict = translations[language] as Record<string, string>;
    return dict[key] || key;
  };

  return { t, language };
}
