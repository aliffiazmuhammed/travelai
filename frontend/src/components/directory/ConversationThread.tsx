import React, { useEffect, useRef, useState } from 'react';
import { Loader2, MessageSquare, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { formatAgencyDate } from '@/lib/agency';
import { cn } from '@/lib/utils';
import type {
  AgencyConversationAuthor,
  AgencyConversationMessage,
} from '@/types/agency';

/**
 * One enquiry thread, shared by the traveller, the guest link and the agency
 * inbox (Milestone 9 D8).
 *
 * The opening enquiry is not stored as a message, so it is passed separately
 * and rendered as the first bubble. Read receipts are per side: the viewer sees
 * "Read" on their own messages once the other side has opened the thread.
 */

export interface ConversationOpening {
  authorName: string;
  body: string;
  createdAt: string | null;
}

interface ConversationThreadProps {
  messages: AgencyConversationMessage[];
  viewer: AgencyConversationAuthor;
  opening?: ConversationOpening;
  canReply?: boolean;
  onSend?: (body: string) => Promise<void>;
  placeholder?: string;
  emptyHint?: string;
  className?: string;
}

const MAX_BODY = 2000;

export const ConversationThread: React.FC<ConversationThreadProps> = ({
  messages,
  viewer,
  opening,
  canReply = true,
  onSend,
  placeholder = 'Write a message…',
  emptyHint = 'No replies yet. Start the conversation below.',
  className,
}) => {
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages.length]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = body.trim();
    if (!text || !onSend || sending) return;
    setSending(true);
    setError(null);
    try {
      await onSend(text);
      setBody('');
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Your message could not be sent.');
    } finally {
      setSending(false);
    }
  };

  const own = viewer;

  return (
    <div className={cn('space-y-3', className)}>
      <div className="max-h-[420px] space-y-3 overflow-y-auto rounded-2xl border border-border/70 bg-background/60 p-3">
        {opening ? (
          <Bubble
            author={opening.authorName || 'Traveller'}
            body={opening.body}
            createdAt={opening.createdAt}
            mine={viewer === 'traveller'}
            label="Enquiry"
          />
        ) : null}

        {messages.length === 0 ? (
          <p className="flex items-center justify-center gap-1.5 py-6 text-[11px] text-muted-foreground">
            <MessageSquare className="h-3.5 w-3.5" />
            {emptyHint}
          </p>
        ) : (
          messages.map((message) => {
            const mine = message.author === own;
            const read =
              viewer === 'traveller'
                ? Boolean(message.readByAgencyAt)
                : Boolean(message.readByTravellerAt);
            return (
              <Bubble
                key={message.id}
                author={message.authorName || (message.author === 'agency' ? 'The agency' : 'Traveller')}
                body={message.body}
                createdAt={message.createdAt}
                mine={mine}
                read={mine ? read : undefined}
              />
            );
          })
        )}
        <div ref={endRef} />
      </div>

      {canReply && onSend ? (
        <form className="space-y-2" onSubmit={submit}>
          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder={placeholder}
            maxLength={MAX_BODY}
            rows={3}
            className="rounded-2xl text-xs"
            disabled={sending}
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-muted-foreground">
              {body.length}/{MAX_BODY}
            </span>
            <Button
              type="submit"
              size="sm"
              className="rounded-xl text-xs font-bold gap-1.5"
              disabled={sending || !body.trim()}
            >
              {sending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              Send message
            </Button>
          </div>
          {error ? <p className="text-[11px] font-semibold text-destructive">{error}</p> : null}
        </form>
      ) : null}
    </div>
  );
};

const Bubble: React.FC<{
  author: string;
  body: string;
  createdAt: string | null;
  mine: boolean;
  read?: boolean;
  label?: string;
}> = ({ author, body, createdAt, mine, read, label }) => (
  <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
    <div
      className={cn(
        'max-w-[85%] space-y-1 rounded-2xl px-3 py-2 text-xs shadow-xs',
        mine
          ? 'bg-primary text-primary-foreground'
          : 'border border-border/60 bg-card text-foreground'
      )}
    >
      <div
        className={cn(
          'flex flex-wrap items-center gap-1.5 text-[10px]',
          mine ? 'text-primary-foreground/80' : 'text-muted-foreground'
        )}
      >
        <span className="font-bold">{mine ? 'You' : author}</span>
        {label ? (
          <span className="rounded-full border border-current/30 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">
            {label}
          </span>
        ) : null}
        {createdAt ? <span>· {formatAgencyDate(createdAt)}</span> : null}
        {read !== undefined ? (
          <span className="ml-auto">{read ? 'Read' : 'Sent'}</span>
        ) : null}
      </div>
      <p className="whitespace-pre-line leading-relaxed">{body}</p>
    </div>
  </div>
);

export default ConversationThread;
