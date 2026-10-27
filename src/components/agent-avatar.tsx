import { AGENT_BY_ID, type AgentDef } from "@/lib/agents";
import { orbColor } from "@/components/ui/orb";

// DESIGN.md → voice-icon-circular: surface-strong plate, full radius, 32px, holding a glyph.
// The glyph here is the agent's soft pastel bloom plus its initial, like ElevenLabs' voice orbs.

export function AgentAvatar({ agent, size = 32, ring = false }: { agent: AgentDef; size?: number; ring?: boolean }) {
  const color = orbColor(agent.orb);
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-strong ${ring ? "ring-2 ring-canvas" : ""}`}
      style={{ width: size, height: size }}
      title={agent.name}
    >
      <span
        aria-hidden
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle at 30% 28%, ${color} 0%, color-mix(in srgb, ${color} 60%, transparent) 48%, transparent 78%)`,
        }}
      />
      <span
        className="relative font-sans font-medium text-ink"
        style={{ fontSize: Math.max(10, Math.round(size * 0.4)), lineHeight: 1 }}
      >
        {agent.name[0]}
      </span>
    </span>
  );
}

export function AgentAvatarById({ id, size, ring }: { id: string; size?: number; ring?: boolean }) {
  const agent = AGENT_BY_ID[id];
  if (!agent) return null;
  return <AgentAvatar agent={agent} size={size} ring={ring} />;
}

export function AvatarStack({ ids, size = 24, max = 6 }: { ids: string[]; size?: number; max?: number }) {
  const shown = ids.slice(0, max);
  return (
    <span className="inline-flex items-center">
      {shown.map((id, i) => (
        <span key={id} style={{ marginLeft: i === 0 ? 0 : -size * 0.3 }}>
          <AgentAvatarById id={id} size={size} ring />
        </span>
      ))}
      {ids.length > max && <span className="ml-1.5 text-caption text-muted">+{ids.length - max}</span>}
    </span>
  );
}

export function UserAvatar({ size = 32 }: { size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-surface-dark text-on-dark"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="12" cy="8.5" r="3.5" />
        <path d="M5 19.5c1.2-3.4 4-5 7-5s5.8 1.6 7 5" strokeLinecap="round" />
      </svg>
    </span>
  );
}
