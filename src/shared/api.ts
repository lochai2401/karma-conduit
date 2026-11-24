export type GuildId = 'vanguard' | 'architects' | 'mystics';

export type TileKind = 'straight' | 'corner' | 'tee' | 'cross';

export type NodeRole = 'none' | 'source' | 'vault' | 'crystal';

export type Rotation = 0 | 1 | 2 | 3;

export type PuzzleTile = {
  index: number;
  row: number;
  col: number;
  kind: TileKind;
  role: NodeRole;
  locked: boolean;
  initialRotation: Rotation;
  solutionRotation: Rotation;
};

export type DailyPuzzleSpec = {
  seedKey: string;
  editionNumber: number;
  title: string;
  gridSize: number;
  parMoves: number;
  author: string;
  isCustomPost: boolean;
  tiles: PuzzleTile[];
};

export type LeaderboardEntry = {
  rank: number;
  username: string;
  score: number;
  moves: number;
  timeSec: number;
  crystals: number;
  guild: GuildId;
};

export type PlayerProfile = {
  username: string;
  currentStreak: number;
  bestStreak: number;
  lastSolvedDate: string;
  guild: GuildId;
  solvedToday: boolean;
  bestScoreToday: number;
  bestMovesToday: number;
  bestTimeSecToday: number;
  crystalsToday: number;
  sharedCommentToday: boolean;
};

export type CommunityStats = {
  solversToday: number;
  totalEnergyToday: number;
  dailyGoalEnergy: number;
  guildScores: Record<GuildId, number>;
};

export type InitResponse = {
  type: 'init';
  postId: string;
  subredditName: string;
  dateKey: string;
  puzzle: DailyPuzzleSpec;
  player: PlayerProfile;
  leaderboard: LeaderboardEntry[];
  community: CommunityStats;
};

export type SubmitScoreRequest = {
  rotations: number[];
  moves: number;
  elapsedSeconds: number;
  hintsUsed: number;
  guild: GuildId;
};

export type SubmitScoreResponse = {
  type: 'submit-score';
  accepted: boolean;
  isNewBest: boolean;
  score: number;
  rank: number;
  poweredCrystals: number;
  totalCrystals: number;
  player: PlayerProfile;
  leaderboard: LeaderboardEntry[];
  community: CommunityStats;
};

export type ShareCommentRequest = {
  rotations: number[];
  moves: number;
  elapsedSeconds: number;
  score: number;
  guild: GuildId;
};

export type ShareCommentResponse = {
  type: 'share-comment';
  posted: boolean;
  message: string;
  markdown: string;
};

export type CreateChallengeRequest = {
  title: string;
  customCode: string;
  gridSize: 4 | 5;
};

export type CreateChallengeResponse = {
  type: 'create-challenge';
  created: boolean;
  postUrl: string;
  message: string;
};
