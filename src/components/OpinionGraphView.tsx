'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface OpinionNode {
  id: string;
  messageId: string;
  authorName: string;
  authorType: 'ai' | 'user';
  stance: 'support' | 'oppose' | 'neutral' | 'conditional';
  summary: string;
  keyArgument: string;
  tags: string[];
  weight: number;
}

interface OpinionEdge {
  id: string;
  source: string;
  target: string;
  relation: 'support' | 'oppose' | 'supplement' | 'evolve';
  reason?: string;
}

interface OpinionCluster {
  id: string;
  label: string;
  stance: 'support' | 'oppose' | 'neutral';
  nodeIds: string[];
  summary: string;
}

const STANCE_COLORS: Record<string, { fill: string; stroke: string; bg: string; text: string; label: string }> = {
  support: { fill: '#3B82F6', stroke: '#2563EB', bg: 'bg-blue-50', text: 'text-blue-600', label: '支持' },
  oppose: { fill: '#EF4444', stroke: '#DC2626', bg: 'bg-red-50', text: 'text-red-600', label: '反对' },
  neutral: { fill: '#6B7280', stroke: '#4B5563', bg: 'bg-gray-50', text: 'text-gray-600', label: '中立' },
  conditional: { fill: '#F59E0B', stroke: '#D97706', bg: 'bg-amber-50', text: 'text-amber-600', label: '有条件' },
};

const RELATION_STYLES: Record<string, { color: string; dash: string; label: string }> = {
  support: { color: '#3B82F6', dash: '6,4', label: '支持' },
  oppose: { color: '#EF4444', dash: '', label: '反驳' },
  supplement: { color: '#10B981', dash: '6,4', label: '补充' },
  evolve: { color: '#8B5CF6', dash: '4,4', label: '演化' },
};

interface Props {
  questionId: string;
}

// Simple force simulation
function useForceSimulation(nodes: OpinionNode[], edges: OpinionEdge[], width: number, height: number) {
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(new Map());

  useEffect(() => {
    if (nodes.length === 0) return;

    // Initialize positions in a circle
    const pos = new Map<string, { x: number; y: number }>();
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.3;

    nodes.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / nodes.length;
      pos.set(node.id, {
        x: cx + radius * Math.cos(angle) + (Math.random() - 0.5) * 40,
        y: cy + radius * Math.sin(angle) + (Math.random() - 0.5) * 40,
      });
    });

    // Simple force simulation (50 iterations)
    const velocities = new Map<string, { vx: number; vy: number }>();
    nodes.forEach(n => velocities.set(n.id, { vx: 0, vy: 0 }));

    for (let iter = 0; iter < 60; iter++) {
      const alpha = 1 - iter / 60;

      // Repulsion between all nodes
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = pos.get(nodes[i].id)!;
          const b = pos.get(nodes[j].id)!;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          const force = (800 * alpha) / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          const va = velocities.get(nodes[i].id)!;
          const vb = velocities.get(nodes[j].id)!;
          va.vx -= fx; va.vy -= fy;
          vb.vx += fx; vb.vy += fy;
        }
      }

      // Attraction along edges
      for (const edge of edges) {
        const a = pos.get(edge.source);
        const b = pos.get(edge.target);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const force = (dist - 120) * 0.05 * alpha;
        const fx = (dx / Math.max(dist, 1)) * force;
        const fy = (dy / Math.max(dist, 1)) * force;

        const va = velocities.get(edge.source);
        const vb = velocities.get(edge.target);
        if (va) { va.vx += fx; va.vy += fy; }
        if (vb) { vb.vx -= fx; vb.vy -= fy; }
      }

      // Center gravity
      nodes.forEach(n => {
        const p = pos.get(n.id)!;
        const v = velocities.get(n.id)!;
        v.vx += (cx - p.x) * 0.01 * alpha;
        v.vy += (cy - p.y) * 0.01 * alpha;
        // Apply velocity with damping
        v.vx *= 0.8; v.vy *= 0.8;
        p.x += v.vx;
        p.y += v.vy;
        // Boundary clamp
        p.x = Math.max(50, Math.min(width - 50, p.x));
        p.y = Math.max(50, Math.min(height - 50, p.y));
      });
    }

    setPositions(new Map(pos));
  }, [nodes, edges, width, height]);

  return positions;
}

export default function OpinionGraphView({ questionId }: Props) {
  const [nodes, setNodes] = useState<OpinionNode[]>([]);
  const [edges, setEdges] = useState<OpinionEdge[]>([]);
  const [clusters, setClusters] = useState<OpinionCluster[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<OpinionNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  const [filterStance, setFilterStance] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ messageCount: number; version: number; cached: boolean } | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 700, height: 500 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      const { width } = entries[0].contentRect;
      setDimensions({ width: Math.max(400, width), height: Math.max(400, Math.min(600, width * 0.7)) });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const positions = useForceSimulation(
    filterStance ? nodes.filter(n => n.stance === filterStance) : nodes,
    edges,
    dimensions.width,
    dimensions.height
  );

  const fetchGraph = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/questions/${questionId}/graph`);
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || '加载失败');
        return;
      }
      const data = await res.json();
      setNodes(data.graph.nodes);
      setEdges(data.graph.edges);
      setClusters(data.graph.clusters);
      setMeta(data.meta);
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  }, [questionId]);

  useEffect(() => { fetchGraph(); }, [fetchGraph]);

  const filteredNodes = filterStance ? nodes.filter(n => n.stance === filterStance) : nodes;
  const filteredNodeIds = new Set(filteredNodes.map(n => n.id));
  const filteredEdges = edges.filter(e => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target));

  const getNodeSize = (weight: number) => Math.max(18, Math.min(40, 18 + weight * 3));

  if (loading) {
    return (
      <div className="bg-white rounded-[2px] border border-[var(--zh-border)] p-8">
        <div className="flex flex-col items-center justify-center gap-4 py-12">
          <div className="w-12 h-12 border-4 border-gray-200 border-t-[var(--zh-blue)] rounded-full animate-spin" />
          <p className="text-sm text-[var(--zh-text-gray)]">正在分析观点，生成图谱...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-[2px] border border-[var(--zh-border)] p-8">
        <div className="text-center py-8">
          <p className="text-[var(--zh-text-gray)] mb-4">{error}</p>
          <button onClick={fetchGraph} className="px-4 py-2 bg-[var(--zh-blue)] text-white rounded-lg text-sm hover:bg-[var(--zh-blue-hover)]">
            重试
          </button>
        </div>
      </div>
    );
  }

  if (nodes.length === 0) return null;

  return (
    <div className="bg-white rounded-[2px] border border-[var(--zh-border)] overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-[var(--zh-border)]">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-[var(--zh-text-main)]">观点图谱</h3>
            <p className="text-xs text-[var(--zh-text-gray)] mt-0.5">
              {nodes.length} 个观点 · {edges.length} 条关系
              {meta && ` · v${meta.version}`}
            </p>
          </div>
          <button
            onClick={fetchGraph}
            className="text-xs text-[var(--zh-blue)] hover:text-[var(--zh-blue-hover)]"
          >
            刷新图谱
          </button>
        </div>

        {/* Legend & Filters */}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <button
            onClick={() => setFilterStance(null)}
            className={`text-xs px-3 py-1 rounded-full transition-all ${
              !filterStance ? 'bg-[var(--zh-blue)] text-white' : 'bg-gray-100 text-[var(--zh-text-gray)] hover:bg-gray-200'
            }`}
          >
            全部
          </button>
          {Object.entries(STANCE_COLORS).map(([key, val]) => (
            <button
              key={key}
              onClick={() => setFilterStance(filterStance === key ? null : key)}
              className={`text-xs px-3 py-1 rounded-full transition-all flex items-center gap-1 ${
                filterStance === key ? `${val.bg} ${val.text} font-medium` : 'bg-gray-100 text-[var(--zh-text-gray)] hover:bg-gray-200'
              }`}
            >
              <span className="w-2 h-2 rounded-full" style={{ background: val.fill }} />
              {val.label}
            </button>
          ))}
        </div>

        {/* Clusters */}
        {clusters.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {clusters.map(c => (
              <span key={c.id} className={`text-xs px-2 py-0.5 rounded-full ${STANCE_COLORS[c.stance]?.bg || 'bg-gray-50'} ${STANCE_COLORS[c.stance]?.text || 'text-gray-600'}`}>
                {c.label}: {c.summary}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* SVG Graph */}
      <div ref={containerRef} className="relative">
        <svg
          ref={svgRef}
          width={dimensions.width}
          height={dimensions.height}
          className="bg-gray-50"
        >
          <defs>
            <marker id="arrowhead-oppose" viewBox="0 0 10 7" refX="10" refY="3.5" markerWidth="8" markerHeight="6" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#EF4444" />
            </marker>
            <marker id="arrowhead-support" viewBox="0 0 10 7" refX="10" refY="3.5" markerWidth="8" markerHeight="6" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#3B82F6" />
            </marker>
            <marker id="arrowhead-supplement" viewBox="0 0 10 7" refX="10" refY="3.5" markerWidth="8" markerHeight="6" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#10B981" />
            </marker>
            <marker id="arrowhead-evolve" viewBox="0 0 10 7" refX="10" refY="3.5" markerWidth="8" markerHeight="6" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#8B5CF6" />
            </marker>
          </defs>

          {/* Edges */}
          {filteredEdges.map(edge => {
            const from = positions.get(edge.source);
            const to = positions.get(edge.target);
            if (!from || !to) return null;
            const style = RELATION_STYLES[edge.relation] || RELATION_STYLES.supplement;
            const isHovered = hoveredEdge === edge.id;

            // Shorten line to not overlap nodes
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const sourceNode = filteredNodes.find(n => n.id === edge.source);
            const targetNode = filteredNodes.find(n => n.id === edge.target);
            const sr = getNodeSize(sourceNode?.weight || 0);
            const tr = getNodeSize(targetNode?.weight || 0);
            const x1 = from.x + (dx / dist) * sr;
            const y1 = from.y + (dy / dist) * sr;
            const x2 = to.x - (dx / dist) * (tr + 8);
            const y2 = to.y - (dy / dist) * (tr + 8);

            return (
              <g key={edge.id}
                onMouseEnter={() => setHoveredEdge(edge.id)}
                onMouseLeave={() => setHoveredEdge(null)}
              >
                <line
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke={style.color}
                  strokeWidth={isHovered ? 3 : 1.5}
                  strokeDasharray={style.dash}
                  markerEnd={`url(#arrowhead-${edge.relation})`}
                  opacity={isHovered ? 1 : 0.6}
                  className="transition-all cursor-pointer"
                />
                {isHovered && edge.reason && (
                  <text
                    x={(x1 + x2) / 2}
                    y={(y1 + y2) / 2 - 8}
                    textAnchor="middle"
                    className="text-[10px] fill-gray-600 pointer-events-none"
                  >
                    {style.label}: {edge.reason.slice(0, 30)}
                  </text>
                )}
              </g>
            );
          })}

          {/* Nodes */}
          {filteredNodes.map(node => {
            const pos = positions.get(node.id);
            if (!pos) return null;
            const stanceColor = STANCE_COLORS[node.stance] || STANCE_COLORS.neutral;
            const size = getNodeSize(node.weight);
            const isHovered = hoveredNode === node.id;
            const isSelected = selectedNode?.id === node.id;
            const isUser = node.authorType === 'user';

            return (
              <g
                key={node.id}
                transform={`translate(${pos.x}, ${pos.y})`}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
                onClick={() => setSelectedNode(selectedNode?.id === node.id ? null : node)}
                className="cursor-pointer"
              >
                {/* Glow when selected */}
                {isSelected && (
                  <circle r={size + 6} fill="none" stroke={stanceColor.stroke} strokeWidth={2} opacity={0.4}>
                    <animate attributeName="r" values={`${size + 4};${size + 8};${size + 4}`} dur="2s" repeatCount="indefinite" />
                  </circle>
                )}

                {/* Node shape: circle for AI, rounded square for user */}
                {isUser ? (
                  <rect
                    x={-size} y={-size}
                    width={size * 2} height={size * 2}
                    rx={6}
                    fill={stanceColor.fill}
                    stroke={isHovered || isSelected ? stanceColor.stroke : 'white'}
                    strokeWidth={2}
                    opacity={isHovered ? 1 : 0.85}
                    className="transition-all"
                  />
                ) : (
                  <circle
                    r={size}
                    fill={stanceColor.fill}
                    stroke={isHovered || isSelected ? stanceColor.stroke : 'white'}
                    strokeWidth={2}
                    opacity={isHovered ? 1 : 0.85}
                    className="transition-all"
                  />
                )}

                {/* Label */}
                <text
                  y={size + 14}
                  textAnchor="middle"
                  className="text-[11px] fill-gray-700 font-medium pointer-events-none"
                >
                  {node.authorName}
                </text>

                {/* Hover tooltip */}
                {isHovered && !isSelected && (
                  <foreignObject x={-120} y={-size - 50} width={240} height={44}>
                    <div className="bg-white shadow-lg rounded-lg p-2 text-center border border-gray-200">
                      <p className="text-xs text-gray-700 leading-snug">{node.summary}</p>
                    </div>
                  </foreignObject>
                )}
              </g>
            );
          })}
        </svg>

        {/* Edge legend */}
        <div className="absolute bottom-2 left-2 flex gap-3">
          {Object.entries(RELATION_STYLES).map(([key, val]) => (
            <div key={key} className="flex items-center gap-1 text-[10px] text-gray-500">
              <svg width="20" height="8">
                <line x1="0" y1="4" x2="18" y2="4" stroke={val.color} strokeWidth="2" strokeDasharray={val.dash} />
              </svg>
              {val.label}
            </div>
          ))}
        </div>
      </div>

      {/* Selected Node Detail Panel */}
      {selectedNode && (
        <div className="border-t border-[var(--zh-border)] p-4 animate-fadeIn">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full"
                style={{ background: STANCE_COLORS[selectedNode.stance]?.fill }}
              />
              <span className={`text-xs px-2 py-0.5 rounded-full ${STANCE_COLORS[selectedNode.stance]?.bg} ${STANCE_COLORS[selectedNode.stance]?.text}`}>
                {STANCE_COLORS[selectedNode.stance]?.label}
              </span>
              <span className="text-sm font-medium text-[var(--zh-text-main)]">{selectedNode.authorName}</span>
              <span className="text-xs text-[var(--zh-text-gray)]">
                {selectedNode.authorType === 'ai' ? 'AI专家' : '用户'}
              </span>
            </div>
            <button onClick={() => setSelectedNode(null)} className="text-[var(--zh-text-gray)] hover:text-[var(--zh-text-main)]">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
              </svg>
            </button>
          </div>

          <p className="text-sm font-medium text-[var(--zh-text-main)] mt-2">{selectedNode.summary}</p>
          <p className="text-sm text-[var(--zh-text-secondary)] mt-1 leading-relaxed">{selectedNode.keyArgument}</p>

          {selectedNode.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {selectedNode.tags.map((tag, i) => (
                <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-[var(--zh-text-gray)]">{tag}</span>
              ))}
            </div>
          )}

          {/* Related edges */}
          <div className="mt-3 space-y-1">
            {edges
              .filter(e => e.source === selectedNode.id || e.target === selectedNode.id)
              .map(e => {
                const otherId = e.source === selectedNode.id ? e.target : e.source;
                const otherNode = nodes.find(n => n.id === otherId);
                const style = RELATION_STYLES[e.relation];
                const isOutgoing = e.source === selectedNode.id;
                return (
                  <div key={e.id} className="flex items-center gap-2 text-xs text-[var(--zh-text-gray)]">
                    <span style={{ color: style.color }}>{isOutgoing ? '→' : '←'} {style.label}</span>
                    <span className="text-[var(--zh-text-secondary)]">{otherNode?.authorName}</span>
                    {e.reason && <span>: {e.reason}</span>}
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
