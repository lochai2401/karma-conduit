import type { PuzzleTile, Rotation } from '../../shared/api';

type ConduitTileProps = {
  tile: PuzzleTile;
  rotation: Rotation;
  powered: boolean;
  hinted: boolean;
  disabled: boolean;
  onRotate: (index: number) => void;
};

export const ConduitTile = ({
  tile,
  rotation,
  powered,
  hinted,
  disabled,
  onRotate,
}: ConduitTileProps) => {
  const effectiveRotation = tile.locked ? tile.solutionRotation : rotation;
  const deg = effectiveRotation * 90;

  const strokeMain = powered ? '#FF5722' : '#475569';
  const strokeCore = powered ? '#FDE047' : '#64748B';

  const borderClass = hinted
    ? 'border-cyan-400 ring-2 ring-cyan-400/70 bg-cyan-950/50'
    : powered
      ? 'border-orange-500/80 bg-slate-900/95 shadow-[0_0_14px_rgba(255,69,0,0.28)]'
      : 'border-slate-700/80 bg-slate-900/80 hover:border-slate-500';

  return (
    <button
      type="button"
      disabled={disabled || tile.locked}
      onClick={() => onRotate(tile.index)}
      aria-label={`Row ${tile.row + 1} Column ${tile.col + 1} ${tile.kind} conduit`}
      className={`relative aspect-square w-full rounded-xl border transition-all duration-150 flex items-center justify-center overflow-hidden ${borderClass} ${
        tile.locked
          ? 'cursor-not-allowed opacity-95'
          : 'cursor-pointer active:scale-95'
      }`}
    >
      <svg
        viewBox="0 0 100 100"
        className={`w-full h-full transition-transform duration-200 ease-out ${
          powered ? 'conduit-energized' : ''
        }`}
        style={{ transform: `rotate(${deg}deg)` }}
      >
        {/* Base North arm (present in straight, corner, tee, cross) */}
        <line
          x1="50"
          y1="0"
          x2="50"
          y2="50"
          stroke={strokeMain}
          strokeWidth="18"
          strokeLinecap="round"
        />
        <line
          x1="50"
          y1="0"
          x2="50"
          y2="50"
          stroke={strokeCore}
          strokeWidth="6"
          strokeLinecap="round"
        />

        {/* East arm (corner, tee, cross) */}
        {(tile.kind === 'corner' ||
          tile.kind === 'tee' ||
          tile.kind === 'cross') && (
          <>
            <line
              x1="50"
              y1="50"
              x2="100"
              y2="50"
              stroke={strokeMain}
              strokeWidth="18"
              strokeLinecap="round"
            />
            <line
              x1="50"
              y1="50"
              x2="100"
              y2="50"
              stroke={strokeCore}
              strokeWidth="6"
              strokeLinecap="round"
            />
          </>
        )}

        {/* South arm (straight, tee, cross) */}
        {(tile.kind === 'straight' ||
          tile.kind === 'tee' ||
          tile.kind === 'cross') && (
          <>
            <line
              x1="50"
              y1="50"
              x2="50"
              y2="100"
              stroke={strokeMain}
              strokeWidth="18"
              strokeLinecap="round"
            />
            <line
              x1="50"
              y1="50"
              x2="50"
              y2="100"
              stroke={strokeCore}
              strokeWidth="6"
              strokeLinecap="round"
            />
          </>
        )}

        {/* West arm (cross only in base orientation) */}
        {tile.kind === 'cross' && (
          <>
            <line
              x1="0"
              y1="50"
              x2="50"
              y2="50"
              stroke={strokeMain}
              strokeWidth="18"
              strokeLinecap="round"
            />
            <line
              x1="0"
              y1="50"
              x2="50"
              y2="50"
              stroke={strokeCore}
              strokeWidth="6"
              strokeLinecap="round"
            />
          </>
        )}

        {/* Center hub */}
        <circle
          cx="50"
          cy="50"
          r="13"
          fill={powered ? '#FF4500' : '#334155'}
          stroke={powered ? '#FEF08A' : '#94A3B8'}
          strokeWidth="3"
        />
      </svg>

      {/* Special Node Role Overlay (does not rotate with pipe!) */}
      {tile.role === 'source' && (
        <span
          title="Snoo Source Core"
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-600 text-xs font-black text-white ring-2 ring-amber-300 shadow-lg">
            ⚡
          </span>
        </span>
      )}

      {tile.role === 'vault' && (
        <span
          title="Subreddit Vault (Required)"
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <span
            className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold ring-2 transition-transform duration-200 ${
              powered
                ? 'scale-110 bg-amber-400 text-slate-950 ring-white shadow-[0_0_12px_rgba(250,204,21,0.95)]'
                : 'bg-slate-800 text-amber-300 ring-amber-500/60'
            }`}
          >
            {powered ? '🏆' : '🎯'}
          </span>
        </span>
      )}

      {tile.role === 'crystal' && (
        <span
          title="Bonus Karma Crystal (+250 pts)"
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] ring-2 transition-transform duration-200 ${
              powered
                ? 'scale-110 bg-cyan-400 text-slate-950 ring-white shadow-[0_0_10px_rgba(34,211,238,0.9)]'
                : 'bg-slate-800/95 text-cyan-300 ring-cyan-500/50'
            }`}
          >
            💎
          </span>
        </span>
      )}

      {tile.locked && (
        <span
          title="Firewall Locked Conduit"
          className="pointer-events-none absolute top-1 right-1 rounded bg-slate-950/90 px-1 text-[9px] font-semibold text-amber-300 border border-amber-500/40"
        >
          🔒
        </span>
      )}
    </button>
  );
};
