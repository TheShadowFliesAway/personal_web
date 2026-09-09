import type { Document, ResearchRoute } from "@/lib/model";
// Render the actual topology; a preview must not imply that branches form one chain.
export default function RouteThumbnail({
  route,
  papers,
}: {
  route: ResearchRoute;
  papers: Document[];
}) {
  if (!route.nodes.length)
    return (
      <div className="mini-route">
        <span className="muted">从第一篇论文开始</span>
      </div>
    );
  const minX = Math.min(...route.nodes.map((n) => n.position.x));
  const minY = Math.min(...route.nodes.map((n) => n.position.y));
  const width = Math.max(...route.nodes.map((n) => n.position.x)) - minX + 260;
  const height = Math.max(...route.nodes.map((n) => n.position.y)) - minY + 90;
  const point = (id: string) => {
    const n = route.nodes.find((n) => n.id === id)!;
    return { x: n.position.x - minX + 10, y: n.position.y - minY + 20 };
  };
  return (
    <div className="route-thumbnail">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${route.title}的论文关联图`}>
        {route.edges.map((e) => {
          const from = point(e.source),
            to = point(e.target);
          const x1 = from.x + 230,
            y1 = from.y + 24,
            x2 = to.x,
            y2 = to.y + 24;
          return (
            <path
              key={e.id}
              d={`M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1} ${(x1 + x2) / 2} ${y2} ${x2} ${y2}`}
              fill="none"
              stroke="#bacdb1"
              strokeWidth="2"
            />
          );
        })}
        {route.nodes.map((n) => {
          const d = papers.find((p) => p.id === n.paperId),
            pos = point(n.id);
          return (
            <g key={n.id} transform={`translate(${pos.x},${pos.y})`}>
              <rect
                width="230"
                height="48"
                rx="7"
                fill={d?.status === "reading" ? "#f3f3e6" : "#f0f5ec"}
                stroke="#d6e2ce"
              />
              <text
                x="115"
                y="29"
                textAnchor="middle"
                fontSize="16"
                fill="#73866a"
                fontFamily="inherit"
              >
                {(d?.title || "已归档论文").slice(0, 25)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
