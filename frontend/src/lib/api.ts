import { BACKEND_URL } from './config';

export interface Conversation {
  id: string;
  title: string | null;
  slug: string;
}

export interface Message {
  id: string;
  content: string;
  role: 'User' | 'Assistant';
  createdAt: string;
  ConversationId: string;
}

export interface ConversationWithMessages {
  id: string;
  title: string | null;
  slug: string;
  userId: string;
  Message: Message[];
}

export interface ParsedResponse {
  answer: string;
  followUps: string[];
  sources: string[];
}

export function parseStreamedResponse(raw: string): ParsedResponse {
  const answerMatch = raw.match(/<ANSWER>([\s\S]*?)<\/ANSWER>/);
  const answer = answerMatch ? (answerMatch[1] ?? '').trim() : raw.trim();

  const followUpsMatch = raw.match(/<FOLLOW_UPS>([\s\S]*?)<\/FOLLOW_UPS>/);
  const followUps: string[] = [];
  if (followUpsMatch) {
    const block = followUpsMatch[1] ?? '';
    const questionsRegex = /<questions>([\s\S]*?)<\/questions>/g;
    let m: RegExpExecArray | null;
    while ((m = questionsRegex.exec(block)) !== null) {
      const q = (m[1] ?? '').trim();
      if (q) followUps.push(q);
    }
  }

  const sourcesMatch = raw.match(/<SOURCES>\s*([\s\S]*?)\s*<\/SOURCES>/);
  let sources: string[] = [];
  if (sourcesMatch) {
    try {
      sources = JSON.parse((sourcesMatch[1] ?? '').trim()) as string[];
    } catch {
    }
  }

  return { answer, followUps, sources };
}


export function extractLiveAnswer(raw: string): string {
  const startIdx = raw.indexOf('<ANSWER>');
  if (startIdx === -1) return '';
  const afterStart = raw.slice(startIdx + '<ANSWER>'.length);
  const endIdx = afterStart.indexOf('</ANSWER>');
  if (endIdx === -1) return afterStart.trimStart();
  return afterStart.slice(0, endIdx).trim();
}

export async function getConversations(jwt: string): Promise<Conversation[]> {
  try {
    const res = await fetch(`${BACKEND_URL}/conversations`, {
      headers: { Authorization: jwt },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.conversations ?? [];
  } catch {
    return [];
  }
}

export async function getConversation(
  jwt: string,
  id: string,
): Promise<ConversationWithMessages | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/conversation/${id}`, {
      headers: { Authorization: jwt },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.conversation ?? null;
  } catch {
    return null;
  }
}

export async function deleteConversation(jwt: string, id: string): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/conversation/${id}`, {
      method: "DELETE",
      headers: { Authorization: jwt },
    });
    return res.ok;
  } catch {
    return false;
  }
}


export async function streamAsk(
  jwt: string,
  query: string,
  conversationId: string | undefined,
  onChunk: (chunk: string) => void,
): Promise<{ conversationId: string }> {
  const res = await fetch(`${BACKEND_URL}/ask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: jwt,
    },
    body: JSON.stringify({ query, conversationId }),
  });

  const convId = res.headers.get('X-Conversation-Id') ?? conversationId ?? '';

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    onChunk(decoder.decode(value, { stream: true }));
  }

  return { conversationId: convId };
}

export async function streamFollowUp(
  jwt: string,
  conversationId: string,
  query: string,
  onChunk: (chunk: string) => void,
): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/ask/follow_ups`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: jwt,
    },
    body: JSON.stringify({ conversationId, query }),
  });

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    onChunk(decoder.decode(value, { stream: true }));
  }
}
