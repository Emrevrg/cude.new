/**
 * Cude.new - Development QA bridge
 *
 * Exposes the *real* pipeline entry points on `window.__cude` so that automated
 * visual QA can drive the application the way a user would, without needing a
 * live LLM provider key.
 *
 * This does not fabricate UI state. Everything reachable here runs the genuine
 * production code paths — requirements extraction, stack intelligence, the
 * product graph and the Design Director all execute for real, and the panels
 * render whatever those functions actually produced.
 *
 * The bridge is compiled out of production builds: it is only installed when
 * `import.meta.env.DEV` is true.
 */

import { startCudePipeline } from './orchestrator';
import {
  addTargetToCurrentProduct,
  architectureStore,
  clearArchitecture,
  designSystemStore,
  pipelineStore,
  platformStore,
  setPlatform,
  updateAgentStatus,
  approveDesignAndBuild,
  requestDesignChanges,
  addPlatformToCurrentProduct,
  designContractStore,
} from '~/lib/stores/cude';
import { workbenchStore } from '~/lib/stores/workbench';
import { chatStore } from '~/lib/stores/chat';

export interface CudeDevBridge {
  startPipeline: typeof startCudePipeline;
  addTarget: typeof addTargetToCurrentProduct;
  setPlatform: typeof setPlatform;
  updateAgentStatus: typeof updateAgentStatus;
  clearArchitecture: typeof clearArchitecture;
  showWorkbench: (visible: boolean) => void;
  showChat: (visible: boolean) => void;

  /** Marks the chat as started, which is what mounts the workbench. */
  setChatStarted: (started: boolean) => void;

  /** Sets terminal visibility explicitly, rather than toggling. */
  setTerminal: (visible: boolean) => void;
  approveDesign: typeof approveDesignAndBuild;
  requestDesignChanges: typeof requestDesignChanges;
  addPlatform: typeof addPlatformToCurrentProduct;
  getState: () => {
    architecture: ReturnType<typeof architectureStore.get>;
    pipeline: ReturnType<typeof pipelineStore.get>;
    designSystem: ReturnType<typeof designSystemStore.get>;
    designContract: ReturnType<typeof designContractStore.get>;
    platform: ReturnType<typeof platformStore.get>;
  };
}

declare global {
  interface Window {
    __cude?: CudeDevBridge;
  }
}

export function installCudeDevBridge() {
  if (typeof window === 'undefined' || !import.meta.env.DEV) {
    return;
  }

  window.__cude = {
    startPipeline: startCudePipeline,
    addTarget: addTargetToCurrentProduct,
    setPlatform,
    updateAgentStatus,
    clearArchitecture,
    showWorkbench: (visible: boolean) => workbenchStore.showWorkbench.set(visible),
    showChat: (visible: boolean) => chatStore.setKey('showChat', visible),
    setChatStarted: (started: boolean) => chatStore.setKey('started', started),
    setTerminal: (visible: boolean) => workbenchStore.toggleTerminal(visible),
    approveDesign: approveDesignAndBuild,
    requestDesignChanges,
    addPlatform: addPlatformToCurrentProduct,
    getState: () => ({
      architecture: architectureStore.get(),
      pipeline: pipelineStore.get(),
      designSystem: designSystemStore.get(),
      designContract: designContractStore.get(),
      platform: platformStore.get(),
    }),
  };
}
