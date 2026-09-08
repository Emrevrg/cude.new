/**
 * Cude.new - the running preview.
 *
 * Shows what Cude built, at whatever widths matter, and lets you point at a
 * piece of it to talk about. The component it replaces was a thousand lines,
 * most of which drew a decorative phone bezel around the same iframe and
 * offered an Expo QR code for a URL nothing in the app ever set.
 *
 * What is kept is what does something: the frame, the port, the path, reload,
 * fullscreen, responsive widths, element selection and region capture.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { Camera, Crosshair, Maximize2, Minimize2, MousePointerSquareDashed, RotateCw } from 'lucide-react';
import { classNames } from '~/utils/classNames';
import { workbenchStore } from '~/lib/stores/workbench';
import { extensionTargets } from '~/lib/cude/previewTargets';
import { ScreenshotSelector } from '~/components/workbench/ScreenshotSelector';
import type { ElementInfo } from '~/components/workbench/Inspector';

export interface PreviewSurfaceProps {
  setSelectedElement?: (element: ElementInfo | null) => void;
}

interface Viewport {
  id: string;
  label: string;
  width: number | null;
}

/*
 * Real breakpoints rather than a catalogue of handsets. What a person checks is
 * whether the layout holds at a phone, a tablet and a desktop width; the exact
 * model is decoration.
 */
const VIEWPORTS: Viewport[] = [
  { id: 'fill', label: 'Fill', width: null },
  { id: 'phone', label: 'Phone', width: 390 },
  { id: 'tablet', label: 'Tablet', width: 834 },
  { id: 'laptop', label: 'Laptop', width: 1280 },
];

const TOOL =
  'flex items-center justify-center rounded-md p-1.5 text-cude-textSecondary transition-colors hover:bg-cude-item-backgroundActive hover:text-cude-textPrimary';

const TOOL_ON = 'bg-cude-item-backgroundActive text-cude-textPrimary';

export const PreviewSurface = memo(({ setSelectedElement }: PreviewSurfaceProps) => {
  const previews = useStore(workbenchStore.previews);
  const files = useStore(workbenchStore.files);
  const surfaces = useMemo(() => extensionTargets(files), [files]);
  const [installHelp, setInstallHelp] = useState(false);

  /*
   * Whether a preview has ever been attached in this session, so the empty
   * state can tell "not started" from "stopped". A ref, because the point is
   * to remember something the current state no longer holds.
   */
  const everHadPreview = useRef(false);

  if (previews.length > 0) {
    everHadPreview.current = true;
  }

  const hadPreview = everHadPreview.current && previews.length === 0;

  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [activePort, setActivePort] = useState<number | null>(null);
  const [path, setPath] = useState('/');
  const [viewport, setViewport] = useState<Viewport>(VIEWPORTS[0]);
  const [landscape, setLandscape] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [capturing, setCapturing] = useState(false);

  /** The port currently on screen, so a later arrival cannot displace it. */
  const shownPort = useRef<number | null>(null);

  /*
   * Follow the lowest port until something is being shown, then stay there.
   *
   * The lowest port is a reasonable opening guess — a project that starts an
   * API on 3001 and the app on 3000 should open on the app. It is a bad rule
   * for what comes after: a second server appearing later on a lower port
   * swapped a working preview for a blank one, in the middle of a change the
   * person had just asked for. Whatever is on screen stays on screen until it
   * goes away or they pick another.
   */
  const active = useMemo(() => {
    if (previews.length === 0) {
      shownPort.current = null;
      return undefined;
    }

    const picked = activePort !== null ? previews.find((preview) => preview.port === activePort) : undefined;
    const staying = picked ?? previews.find((preview) => preview.port === shownPort.current);
    const chosen = staying ?? [...previews].sort((a, b) => a.port - b.port)[0];

    shownPort.current = chosen.port;

    return chosen;
  }, [previews, activePort]);

  const src = useMemo(
    () => (active ? `${active.baseUrl}${path.startsWith('/') ? path : `/${path}`}` : undefined),
    [active, path],
  );

  // A new preview starts at its root, not at whatever path the last one was on.
  useEffect(() => {
    setPath('/');
  }, [active?.baseUrl]);

  /**
   * Bumped to reload; used as the iframe's key so React builds a new one.
   *
   * Reassigning `src` to the same value is the usual trick and it does not
   * work here: the preview is a credentialless iframe, and re-setting its src
   * left an empty frame — the reload button appeared to break the page, and so
   * did every automatic refresh. Replacing the element loads it cleanly.
   */
  const [reloadCount, setReloadCount] = useState(0);

  const reload = useCallback(() => {
    setReloadCount((count) => count + 1);
  }, []);

  /*
   * Reload when the workspace says the files behind this page have changed.
   *
   * `refreshToken` was incremented by `refreshAllPreviews` and read by nobody,
   * so the whole refresh mechanism did nothing: saving a file in the editor
   * left the preview on the old page, and so did a change the Builder wrote.
   * A person asked for a longer timer, Cude wrote it, the server had it, and
   * the screen still said 25:00.
   */
  useEffect(() => {
    if (active?.refreshToken) {
      reload();
    }
  }, [active?.refreshToken, reload]);

  const toggleFullscreen = useCallback(async () => {
    if (!document.fullscreenElement && containerRef.current) {
      await containerRef.current.requestFullscreen().catch(() => undefined);
    } else if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);

    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const tellInspector = useCallback((activeMode: boolean) => {
    iframeRef.current?.contentWindow?.postMessage({ type: 'INSPECTOR_ACTIVATE', active: activeMode }, '*');
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      /*
       * Only the preview frame gets to drive this. Without the source check any
       * page in any tab could push an element selection into the conversation.
       */
      if (event.source !== iframeRef.current?.contentWindow) {
        return;
      }

      if (event.data?.type === 'INSPECTOR_READY') {
        tellInspector(inspecting);
        return;
      }

      if (event.data?.type === 'INSPECTOR_CLICK') {
        const element = event.data.elementInfo as ElementInfo;
        setSelectedElement?.(element);

        /*
         * Copying is a convenience. The inherited version reported the
         * selection inside the clipboard promise, so a denied clipboard
         * permission meant clicking an element did nothing at all.
         */
        navigator.clipboard?.writeText(element.displayText).catch(() => undefined);
      }
    };

    window.addEventListener('message', onMessage);

    return () => window.removeEventListener('message', onMessage);
  }, [inspecting, setSelectedElement, tellInspector]);

  const toggleInspecting = useCallback(() => {
    setInspecting((current) => {
      tellInspector(!current);
      return !current;
    });
  }, [tellInspector]);

  const width = viewport.width === null ? null : landscape ? Math.round(viewport.width * 1.5) : viewport.width;

  return (
    <div ref={containerRef} className="relative flex h-full w-full flex-col bg-cude-background-depth-1">
      {surfaces.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-cude-borderColor px-3 py-2 text-xs">
          <span>Extension UI</span>
          {surfaces.map((surface) => (
            <button
              key={surface.label}
              className="rounded border border-cude-borderColor px-2 py-1"
              onClick={() => {
                setPath(surface.path);
                setViewport(surface.label === 'Popup' ? { id: 'popup', label: 'Popup', width: 380 } : VIEWPORTS[0]);
              }}
            >
              {surface.label}
            </button>
          ))}
          <button
            className="ml-auto underline"
            onClick={() => setInstallHelp(!installHelp)}
            aria-expanded={installHelp}
          >
            Install in Chrome / Edge
          </button>
          {installHelp && (
            <div className="w-full space-y-2 py-2">
              <p>
                This preview displays the extension pages. Browser permissions, content scripts and background workers
                must be tested in the browser.
              </p>
              <p>
                Export and extract the project, build it if required, then open chrome://extensions or
                edge://extensions. Enable Developer mode and choose Load unpacked, selecting the folder containing the
                built manifest.json. After changes, export/build again and use Reload on the extension.
              </p>
              <button
                className="rounded border border-cude-borderColor px-3 py-1"
                onClick={() => {
                  void workbenchStore.downloadZip();
                }}
              >
                Export extension project
              </button>
            </div>
          )}
        </div>
      )}
      <div className="flex items-center gap-2 border-b border-cude-borderColor bg-cude-background-depth-2 px-2 py-1.5">
        <button onClick={reload} title="Reload" aria-label="Reload the preview" className={TOOL}>
          <RotateCw className="h-4 w-4" />
        </button>

        {/*
          Only when there is a choice to make.

          A project can run more than one server — an app and an API, or a
          replacement started beside the old one. Cude picked one of them and
          gave no way to see the others, so if it picked wrong the person was
          simply looking at the wrong thing with nothing to click.
        */}
        {previews.length > 1 && (
          <div className="flex items-center gap-0.5 rounded-md border border-cude-borderColor p-0.5">
            {[...previews]
              .sort((a, b) => a.port - b.port)
              .map((preview) => (
                <button
                  key={preview.port}
                  onClick={() => setActivePort(preview.port)}
                  title={`Show the server on port ${preview.port}`}
                  aria-label={`Show the server on port ${preview.port}`}
                  aria-pressed={active?.port === preview.port}
                  className={classNames('rounded px-1.5 py-0.5 text-[11px] transition-colors', {
                    'bg-cude-item-backgroundAccent text-cude-item-contentAccent': active?.port === preview.port,
                    'text-cude-textTertiary hover:text-cude-textPrimary': active?.port !== preview.port,
                  })}
                >
                  {preview.port}
                </button>
              ))}
          </div>
        )}

        <div className="flex flex-1 items-center gap-1 rounded-full border border-cude-borderColor bg-cude-preview-addressBar-background px-2 py-1 text-sm">
          {previews.length > 1 && (
            <select
              value={active?.port ?? ''}
              onChange={(event) => setActivePort(Number(event.target.value))}
              aria-label="Preview port"
              className="bg-transparent text-xs text-cude-textSecondary outline-none"
            >
              {previews.map((preview) => (
                <option key={preview.port} value={preview.port}>
                  :{preview.port}
                </option>
              ))}
            </select>
          )}

          <input
            value={path}
            onChange={(event) => setPath(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                setPath((current) => (current.startsWith('/') ? current : `/${current}`));
              }
            }}
            aria-label="Path"
            placeholder="/"
            spellCheck={false}
            className="w-full bg-transparent text-cude-preview-addressBar-text outline-none"
          />
        </div>

        <div className="flex items-center gap-0.5">
          {VIEWPORTS.map((option) => (
            <button
              key={option.id}
              onClick={() => setViewport(option)}
              className={classNames(
                'rounded-md px-2 py-1 text-xs transition-colors',
                viewport.id === option.id
                  ? 'bg-cude-item-backgroundActive text-cude-textPrimary'
                  : 'text-cude-textTertiary hover:text-cude-textSecondary',
              )}
            >
              {option.label}
            </button>
          ))}

          {viewport.width !== null && (
            <button
              onClick={() => setLandscape((current) => !current)}
              title="Rotate"
              aria-label="Rotate the viewport"
              className={classNames(TOOL, landscape && TOOL_ON)}
            >
              <MousePointerSquareDashed className="h-4 w-4 rotate-90" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-0.5">
          <button
            onClick={toggleInspecting}
            title="Select an element"
            aria-label="Select an element in the preview"
            className={classNames(TOOL, inspecting && TOOL_ON)}
          >
            <Crosshair className="h-4 w-4" />
          </button>

          <button
            onClick={() => setCapturing((current) => !current)}
            title="Capture a region"
            aria-label="Capture a region of the preview"
            className={classNames(TOOL, capturing && TOOL_ON)}
          >
            <Camera className="h-4 w-4" />
          </button>

          <button
            onClick={toggleFullscreen}
            title={fullscreen ? 'Leave fullscreen' : 'Fullscreen'}
            aria-label={fullscreen ? 'Leave fullscreen' : 'Show the preview fullscreen'}
            className={TOOL}
          >
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="relative flex flex-1 justify-center overflow-auto bg-cude-background-depth-3">
        {/*
         * The chosen width applies whether or not anything is running, so
         * picking a viewport shows you the shape you asked for immediately.
         */}
        <div
          data-testid="preview-frame"
          className={classNames('relative h-full', src && 'bg-cude-background-depth-1')}
          style={{ width: width === null ? '100%' : `${width}px`, maxWidth: '100%' }}
        >
          {src ? (
            <>
              <iframe
                key={`${active?.baseUrl ?? ''}#${reloadCount}`}
                ref={iframeRef}
                src={src}
                title="Preview"
                allowFullScreen
                className="h-full w-full border-0"
                sandbox="allow-scripts allow-forms allow-popups allow-modals allow-same-origin"
              />

              <ScreenshotSelector
                isSelectionMode={capturing}
                setIsSelectionMode={setCapturing}
                containerRef={iframeRef}
              />
            </>
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center">
              {/*
                Two different situations, and they were saying the same thing.

                "Nothing is running yet" is right before anything has been
                built. It is wrong after a server has been running and stopped
                — which happens: a model killed its own file server to restart
                it and the restart failed, and the panel then reported the
                state of a fresh workspace. The person is left believing they
                never started anything, when in fact it had been working a
                moment ago.
              */}
              <p className="text-sm text-cude-textTertiary">
                {hadPreview
                  ? 'The server that was serving this preview has stopped. Ask Cude to start it again.'
                  : 'Nothing is running yet. Start the project and its preview appears here.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

PreviewSurface.displayName = 'PreviewSurface';
