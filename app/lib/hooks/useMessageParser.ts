// Cude.new - useMessageParser.ts (Cude product surface, 2026)
import type { Message } from 'ai';
import { useCallback, useState } from 'react';
import { ArtifactParser } from '~/lib/cude/pipeline/artifactParser';
import { workbenchStore } from '~/lib/stores/workbench';
import type { ActionEvent } from '~/lib/cude/pipeline/artifactParser';
import type { ActionCallbackData } from '~/lib/cude/pipeline/artifactParser';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('useMessageParser');

/*
 * Bridge the parser's events onto the workbench. File actions are registered as
 * soon as they open so their content streams into the editor; everything else
 * is registered on close, when its command is complete.
 */
const messageParser = new ArtifactParser({
  renderArtifact: (artifact, messageId) => {
    const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    return `<div class="__cudeArtifact__" data-message-id="${escape(messageId)}" data-artifact-id="${escape(artifact.id)}"></div>`;
  },
  callbacks: {
    onArtifactOpen: ({ messageId, artifact }) => {
      logger.trace('artifact open', artifact.id);

      workbenchStore.addArtifact({ messageId, id: artifact.id, title: artifact.title, type: 'bundled' });
    },
    onArtifactClose: ({ messageId, artifact }) => {
      logger.trace('artifact close', artifact.id);

      workbenchStore.updateArtifact(
        { messageId, id: artifact.id, title: artifact.title, artifactId: artifact.id },
        { closed: true },
      );
    },
    onActionOpen: (event) => {
      if (event.action.type === 'file') {
        workbenchStore.addAction(toWorkbenchAction(event));
      }
    },
    onActionStream: (event) => {
      workbenchStore.runAction(toWorkbenchAction(event), true);
    },
    onActionClose: (event) => {
      if (event.action.type !== 'file') {
        workbenchStore.addAction(toWorkbenchAction(event));
      }

      workbenchStore.runAction(toWorkbenchAction(event));
    },
  },
});

/** Map a parser event onto the shape the workbench's action queue expects. */
function toWorkbenchAction(event: ActionEvent): ActionCallbackData {
  const { action } = event;

  return {
    messageId: event.messageId,
    artifactId: event.artifactId,
    actionId: event.actionId,
    action:
      action.type === 'file'
        ? { type: 'file', filePath: action.filePath ?? '', content: action.content }
        : ({ type: action.type, content: action.content } as ActionCallbackData['action']),
  };
}

const extractTextContent = (message: Message) =>
  Array.isArray(message.content)
    ? (message.content.find((item) => item.type === 'text')?.text as string) || ''
    : message.content;

export function useMessageParser() {
  const [parsedMessages, setParsedMessages] = useState<{ [key: number]: string }>({});

  const parseMessages = useCallback((messages: Message[], isLoading: boolean) => {
    let reset = false;

    if (import.meta.env.DEV && !isLoading) {
      reset = true;
      messageParser.reset();
    }

    for (const [index, message] of messages.entries()) {
      if (message.role === 'assistant' || message.role === 'user') {
        const newParsedContent = messageParser.parse(message.id, extractTextContent(message));
        setParsedMessages((prevParsed) => ({
          ...prevParsed,
          [index]: !reset ? (prevParsed[index] || '') + newParsedContent : newParsedContent,
        }));
      }
    }
  }, []);

  return { parsedMessages, parseMessages };
}
