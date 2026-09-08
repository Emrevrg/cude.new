/**
 * Cude.new - Product Graph UI
 *
 * A compact, readable view of the connected product: which applications exist,
 * which services they share, and how they are wired. Deliberately not a node
 * editor — the goal is that a reader understands the architecture at a glance.
 *
 * Everything rendered here comes from the real ProductGraph in the store.
 */

import { useStore } from '@nanostores/react';
import { architectureStore } from '~/lib/stores/cude';
import {
  getSharedServices,
  getTargetNodes,
  validateProductGraph,
  type ProductGraph,
  type ProductNode,
  type RelationshipType,
} from '~/lib/cude/productGraph';
import { classNames } from '~/utils/classNames';

const NODE_ICONS: Record<ProductNode['type'], string> = {
  target: 'i-ph:app-window',
  service: 'i-ph:cloud',
  database: 'i-ph:database',
  auth: 'i-ph:fingerprint',
  sync: 'i-ph:arrows-clockwise',
  contract: 'i-ph:file-code',
  design: 'i-ph:palette',
};

const RELATIONSHIP_LABELS: Record<RelationshipType, string> = {
  USES_API: 'uses API',
  USES_DATABASE: 'uses database',
  SHARES_AUTH: 'shares auth',
  SHARES_TYPES: 'shares contracts',
  SHARES_DOMAIN: 'shares domain',
  SHARES_DESIGN_SYSTEM: 'shares design',
  SYNC_WITH: 'syncs via',
  DEPENDS_ON: 'depends on',
};

function EmptyState() {
  return (
    <div className="p-6 rounded-lg border border-cude-borderColor bg-cude-background-depth-1">
      <div className="text-[11px] tracking-widest font-semibold text-cude-textTertiary mb-2">PRODUCT GRAPH</div>
      <div className="text-sm text-cude-textSecondary max-w-md leading-relaxed">
        When your product has more than one target, the applications and the services they share appear here as a
        connected family rather than separate projects.
      </div>
    </div>
  );
}

/**
 * Application targets are drawn solid; shared resources are drawn with a dashed
 * edge and a flatter surface, so "what we ship" reads differently from "what we
 * share" without needing a legend.
 */
function NodeCard({ node, subtitle }: { node: ProductNode; subtitle?: string }) {
  const isTarget = node.type === 'target';

  return (
    <div
      className={classNames(
        'flex items-start gap-2.5 px-3 py-2 rounded-md border min-w-0',
        isTarget
          ? 'border-cude-borderColor bg-cude-background-depth-2'
          : 'border-dashed border-cude-borderColor bg-transparent',
      )}
    >
      <span
        className={classNames(
          NODE_ICONS[node.type],
          'text-base mt-0.5 shrink-0',
          isTarget ? 'text-cude-textPrimary' : 'text-cude-textTertiary',
        )}
      />
      <div className="min-w-0">
        <div
          className={classNames(
            'text-xs truncate',
            isTarget ? 'font-medium text-cude-textPrimary' : 'text-cude-textSecondary',
          )}
        >
          {node.name}
        </div>
        {subtitle && <div className="text-[11px] text-cude-textTertiary truncate">{subtitle}</div>}
      </div>
    </div>
  );
}

/**
 * Renders the family as three columns — targets, the services they share, and
 * the data layer behind them — which is the shape almost every product graph
 * actually takes.
 */
function GraphDiagram({ graph }: { graph: ProductGraph }) {
  const targets = getTargetNodes(graph);
  const services = getSharedServices(graph);

  const dataLayer = services.filter((n) => n.type === 'database');
  const middleLayer = services.filter((n) => n.type !== 'database');

  return (
    <div className="grid gap-3 md:grid-cols-[minmax(0,0.85fr)_auto_minmax(0,1fr)] items-start">
      <div className="flex flex-col gap-2 min-w-0">
        <div className="text-[10px] tracking-widest font-semibold text-cude-textTertiary">APPLICATION TARGETS</div>
        {targets.map((node) => (
          <NodeCard
            key={node.id}
            node={node}
            subtitle={node.stackId ? `${node.language} · ${node.framework}` : undefined}
          />
        ))}
      </div>

      <div className="hidden md:flex flex-col items-center text-cude-textTertiary px-1 pt-6">
        <span className="i-ph:arrow-right text-lg" />
      </div>

      <div className="flex flex-col gap-2 min-w-0">
        {middleLayer.length > 0 && (
          <>
            <div className="text-[10px] tracking-widest font-semibold text-cude-textTertiary">SHARED RESOURCES</div>
            {middleLayer.map((node) => (
              <NodeCard key={node.id} node={node} subtitle={node.capabilities.slice(0, 3).join(' · ')} />
            ))}
          </>
        )}

        {dataLayer.length > 0 && (
          <>
            <div className="text-[10px] tracking-widest font-semibold text-cude-textTertiary mt-1">DATA</div>
            {dataLayer.map((node) => (
              <NodeCard key={node.id} node={node} subtitle={node.capabilities.slice(0, 3).join(' · ')} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

export function ProductGraphPanel({ className }: { className?: string }) {
  const architecture = useStore(architectureStore);

  if (!architecture) {
    return <EmptyState />;
  }

  const graph = architecture.productGraph;
  const targets = getTargetNodes(graph);
  const services = getSharedServices(graph);
  const validation = validateProductGraph(graph);

  const nodeName = (id: string) => graph.nodes.find((n) => n.id === id)?.name ?? id;

  return (
    <div className={classNames('flex flex-col gap-4', className)}>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-[11px] tracking-widest font-semibold text-cude-textTertiary">PRODUCT GRAPH</span>
        <span className="text-[11px] text-cude-textTertiary">
          {targets.length} {targets.length === 1 ? 'target' : 'targets'} · {services.length} shared
        </span>
        {!validation.valid && (
          <span className="ml-auto text-[10px] tracking-widest px-1.5 py-0.5 rounded border border-cude-borderColor text-cude-textTertiary">
            {validation.issues.length} ISSUE{validation.issues.length === 1 ? '' : 'S'}
          </span>
        )}
      </div>

      <GraphDiagram graph={graph} />

      {(architecture.requirements.offlineRequirements ||
        architecture.requirements.synchronizationRequirements.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {architecture.requirements.offlineRequirements && (
            <span className="px-2 py-0.5 rounded border border-cude-borderColor text-[10px] tracking-wide text-cude-textSecondary">
              OFFLINE CAPABLE
            </span>
          )}
          {architecture.requirements.synchronizationRequirements.map((requirement) => (
            <span
              key={requirement}
              className="px-2 py-0.5 rounded border border-cude-borderColor text-[10px] tracking-wide text-cude-textSecondary"
            >
              {requirement.replace(/-/g, ' ').toUpperCase()}
            </span>
          ))}
        </div>
      )}

      <div>
        <div className="text-[10px] tracking-widest font-semibold text-cude-textTertiary mb-1.5">CONNECTIONS</div>
        <div className="rounded-md border border-cude-borderColor divide-y divide-cude-borderColor overflow-hidden">
          {graph.relationships.map((rel) => (
            <div key={rel.id} className="flex items-center gap-2 px-3 py-1.5 text-[11px] min-w-0">
              <span className="text-cude-textPrimary truncate">{nodeName(rel.source)}</span>
              <span className="text-cude-textTertiary shrink-0">{RELATIONSHIP_LABELS[rel.type]}</span>
              <span className="text-cude-textSecondary truncate">{nodeName(rel.target)}</span>
            </div>
          ))}
        </div>
      </div>

      {!validation.valid && (
        <div>
          <div className="text-[10px] tracking-widest font-semibold text-cude-textTertiary mb-1.5">ISSUES</div>
          <ul className="space-y-1">
            {validation.issues.map((issue) => (
              <li key={issue} className="text-[11px] text-cude-textSecondary flex gap-2">
                <span className="text-cude-textTertiary">•</span>
                <span>{issue}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
