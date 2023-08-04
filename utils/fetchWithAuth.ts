import firebase from 'firebase/app';

export async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const user = firebase.auth().currentUser;
  let idToken = '';

  if (user) {
    idToken = await user.getIdToken(true);
  }

  const headers = { ...options.headers, 'Authorization': `Bearer ${idToken}` };

  return fetch(url, { ...options, headers });
}

export interface MessageEvent {
  data: string;
}

export interface FetchEventSourceWithAuthOptions {
  body?: string;
  onmessage?: (event: MessageEvent) => void;
  method?: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export async function fetchEventSourceWithAuth(
  url: string,
  options: FetchEventSourceWithAuthOptions = {}
) {
  const user = firebase.auth().currentUser;
  let idToken = '';

  if (user) {
    idToken = await user.getIdToken(true);
  }

  const headers = {
    ...options.headers,
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${idToken}`
  };

  const response = await fetch(url, {
    ...options,
    headers,
    body: options.body
  });

  const reader = response.body?.getReader();
  if (!reader) {
    return;
  }

  let decoder = new TextDecoder();
  let dataBuffer = "";

  reader.read().then(function processResult(result) {
    if (result.done) return;

    const chunk = decoder.decode(result.value, { stream: true });
    dataBuffer += chunk;

    let lines = dataBuffer.split('\n');

    // If the dataBuffer ends with '\n', the last line is complete, otherwise keep it in the buffer for next chunk
    dataBuffer = lines[lines.length - 1].endsWith('\n') ? '' : lines.pop() as string;

    for (let line of lines) {
      if (line.startsWith('data:')) {
        let data = line.slice(5).trim();

        if (options.onmessage) {
          options.onmessage({ data });
        }
      }
    }

    reader.read().then(processResult);
  });
}