// Cude.new - SendButton.client.tsx (Cude product surface, 2026)
import { AnimatePresence, cubicBezier, motion } from 'framer-motion';

interface SendButtonProps {
  show: boolean;
  isStreaming?: boolean;
  disabled?: boolean;
  onClick?: (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
  onImagesSelected?: (images: File[]) => void;
}

const customEasingFn = cubicBezier(0.4, 0, 0.2, 1);

export const SendButton = ({ show, isStreaming, disabled, onClick }: SendButtonProps) => {
  /*
   * The button's only content is an icon element, so without an explicit label
   * it reaches assistive technology — and every automated check — as an unnamed
   * button. The name also has to change with the action: while a run is
   * streaming this same control stops it.
   */
  const label = isStreaming ? 'Stop generating' : 'Send message';

  return (
    <AnimatePresence>
      {show ? (
        <motion.button
          type="button"
          aria-label={label}
          title={label}
          className="absolute flex justify-center items-center top-[18px] right-[22px] p-1 bg-cude-button-primary-background hover:bg-cude-button-primary-backgroundHover text-cude-button-primary-text rounded-md w-[34px] h-[34px] transition-theme disabled:opacity-50 disabled:cursor-not-allowed"
          transition={{ ease: customEasingFn, duration: 0.17 }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          disabled={disabled}
          onClick={(event) => {
            event.preventDefault();

            if (!disabled) {
              onClick?.(event);
            }
          }}
        >
          <div className="text-lg">
            {!isStreaming ? <div className="i-ph:arrow-right"></div> : <div className="i-ph:stop-circle-bold"></div>}
          </div>
        </motion.button>
      ) : null}
    </AnimatePresence>
  );
};
