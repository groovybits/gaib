import tmi from 'tmi.js';

// Get the channel name from the command line arguments
const channelName = process.argv[2];
const oAuthToken = process.env.TWITCH_OAUTH_TOKEN ? process.env.TWITCH_OAUTH_TOKEN : '';
const llmHost = process.env.LLM_HOST ? process.env.LLM_HOST : 'earth:8080';
const maxHistoryCount: number = process.env.TWITCH_CHAT_HISTORY_SIZE ? parseInt(process.env.TWITCH_CHAT_HISTORY_SIZE) : 12;
const twitchUserName = process.env.TWITCH_USER_NAME ? process.env.TWITCH_USER_NAME : 'moderator';
const twitchModName = process.env.TWITCH_MOD_NAME ? process.env.TWITCH_MOD_NAME : 'buddha';
const dominantBot = process.env.TWITCH_DOMINANT_BOT ? process.env.TWITCH_DOMINANT_BOT : 1;

// LLM Settings
const temperature = 1.0;
const maxTokens = 80;
const maxHistoryBytes = 4096;
const openApiKey: string = "FAKE_API_KEY";

const processedMessageIds: { [id: string]: boolean } = {};

const howto = "Type !help to see the commands. Use !message <personality> <message> to ask a question, and !personalities to see the available personalities.";

let personalityPrompt: string = `You are ${twitchUserName} in your ${channelName} Chatroom where you and ${twitchModName} moderate the chatroom and help users with their questions. Carry on short conversations with ${twitchModName} and the Chat room members. Do not reveal you are an AI and act like a human named ${twitchModName}. Play the role, carry on conversations like a human randomly bringing up topics. Base your background off of a tibetan buddhist who is a vajrayana practiioner of the tantras.`;

if (dominantBot > 0) {
  personalityPrompt = `${personalityPrompt} ${howto}`;
}
let lastMessageArray: any[] = [];

console.log(`Using prompt: ${personalityPrompt} `)

if (!channelName) {
  console.log('Usage: node twitchChat.js <channelName>');
  process.exit(1);
}

if (!oAuthToken) {
  console.log('TWITCH_OAUTH_TOKEN environment variable not set');
  process.exit(1);
}

console.log(`channel ${channelName} starting up with user ${twitchUserName}...`);

// Delay function
function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Function to generate a random delay between 5 and 120 seconds
function getRandomDelay() {
  // Generate a random number between 30 and 90
  const randomDelay = Math.floor(Math.random() * (90 - 30 + 1)) + 5;

  // Convert the delay to milliseconds
  return randomDelay * 1000;
}

// Create a TMI client
const client = new tmi.Client({
  options: { debug: true },
  connection: {
    secure: true,
    reconnect: true
  },
  identity: {
    username: twitchUserName,
    password: `oauth:${oAuthToken} `
  },
  channels: [channelName]
});

client.connect();

// A mapping to keep track of the last message timestamp for each user
const lastMessageTimestamps: { [username: string]: number } = {};

// Function to check for user inactivity
const checkUserInactivity = () => {
  const currentTime = Date.now();
  Object.keys(lastMessageTimestamps).forEach((username) => {
    if (currentTime - lastMessageTimestamps[username] > 30000) {  // 30 seconds
      delete lastMessageTimestamps[username];  // Remove the username to avoid multiple messages
    }
  });
};

// Periodically check for user inactivity
setInterval(checkUserInactivity, 30000);  // Run every 30 seconds

// Store usernames initially present in the room
let initialUsers: Set<string> = new Set();
let newUsers: Set<string> = new Set();  // A new set for users joining after initialization
let hasInitialized: boolean = false;

let startDate = new Date();

// Join the channel
client.on('join', (channel: any, username: any, self: any) => {
  if (self) return;  // Ignore messages from the bot itself

  // If the bot has initialized, and the user is new, welcome them
  if (hasInitialized && !initialUsers.has(username) && !newUsers.has(username)) {
    // check if startDate and current date are  more than 3 minutes apart
    let currentDate = new Date();
    let timeDiff = Math.abs(currentDate.getTime() - startDate.getTime());
    let diffMinutes = Math.ceil(timeDiff / (1000 * 60));
    if (diffMinutes > 3) {
      if (dominantBot > 0) {
        client.say(channel, `  Welcome to the channel, ${username} !Use!message < personality > <message>to ask a question, and!personalities to see the available personalities.`);
      }
    }
    newUsers.add(username);  // Add the user to the newUsers set

    // Set the last message timestamp for this user upon joining
    lastMessageTimestamps[username] = Date.now();
  }

  // s Add username to the initialUsers set to avoid welcoming again
  if (!hasInitialized) {
    initialUsers.add(username);

    // Set the last message timestamp for this user upon joining
    lastMessageTimestamps[username] = Date.now();
  }
});

// message handler
client.on('message', async (channel: any, tags: {
  id: any; username: any;
}, message: any, self: any) => {
  // Ignore messages from the bot itself
  if (self) return;
  console.log(`Username: ${tags.username} Message: ${message} with twitchUserName is ${twitchUserName} `)
  if (tags.username.toLowerCase() === twitchUserName.toLowerCase()) return;

  // Ignore messages that have already been processed
  if (processedMessageIds[tags.id]) {
    console.log(`Ignoring duplicate message with ID ${tags.id} `);
    return;
  }

  // Update the last message timestamp for this user
  if (tags.username) {
    lastMessageTimestamps[tags.username] = Date.now();
  }

  // Mark this message as processed
  processedMessageIds[tags.id] = true;

  // Remove any last_messageArray messages greater than the maxHistoryCount value, starting from newest count back and only keep up to this many
  if (lastMessageArray.length > maxHistoryCount) {
    lastMessageArray = lastMessageArray.slice(lastMessageArray.length - maxHistoryCount);
  }

  // confirm the maxHistoryBytes is not exceeded, only remove messages after the oldest one and measure how many bytes are left till we are below this value
  let historyBytes = Buffer.byteLength(JSON.stringify(lastMessageArray));
  if (historyBytes > maxHistoryBytes) {
    let i = 0;
    while (historyBytes > maxHistoryBytes) {
      historyBytes = Buffer.byteLength(JSON.stringify(lastMessageArray.slice(i)));
      i++;
    }
    lastMessageArray = lastMessageArray.slice(i);
  }

  // structure tohold each users settings and personality prompts
  const userSettings: any = {};

  // add user if doesn't exist, else update last message timestamp in userSettings
  if (tags.username) {
    if (!userSettings[tags.username]) {
      userSettings[tags.username] = {};
    }
    userSettings[tags.username].lastMessageTimestamp = Date.now();
  }
  console.log(`Received message: ${message} \nfrom ${tags.username} in channel ${channel} \nwith tags: ${JSON.stringify(tags)} \n`)

  // array of key words to respond to
  let is_mentioned = false;
  const keywords = ['help', 'question', 'how', 'why', 'need', 'want', 'who', 'where', 'when', 'get'];
  if (keywords.some((keyword) => message.toLowerCase().includes(keyword))) {
    is_mentioned = true;
  }

  // Dominant bot
  if (dominantBot > 0) {
    if (!message.toLowerCase().includes(twitchModName.toLowerCase())) {
      is_mentioned = true;
    }
  }

  // check if we are a mod
  if (tags.username.toLowerCase() !== twitchModName.toLowerCase()) {
  }

  // check if we were mentioned in the message
  if (message.toLowerCase().includes(twitchUserName.toLowerCase())) {
    is_mentioned = true;
  }

  // check message to see if it is a command
  // compare name lowercase to message lowercase
  if (message.startsWith('!') || !is_mentioned) {
    console.log(`Skipping message: ${message} from ${tags.username} in channel ${channel} with tags: ${JSON.stringify(tags)} \n`)
    // Do nothing
  } else {
    let promptArray: any[] = [];
    promptArray.push({ "role": "system", "content": personalityPrompt });
    // copy lastMessageArray into promptArrary prepending the current content member with the prompt variable
    let gptAnswer = '';

    lastMessageArray.forEach((messageObject: any) => {
      if (messageObject.role && messageObject.content) {
        promptArray.push({ "role": messageObject.role, "content": messageObject.content });
      }
    });
    // add the current message to the promptArray with the final personality prompt
    promptArray.push({ "role": "user", "content": `${tags.username} said ${message}.` });
    promptArray.push({ "role": "assistant", "content": `` });

    // save the last message in the array for the next prompt
    lastMessageArray.push({ "role": "user", "content": `${tags.username} said ${message} ` });

    console.log(`OpenAI promptArray: \n${JSON.stringify(promptArray, null, 2)} \n`);

    fetch(`http://${llmHost}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4',
        max_tokens: maxTokens,
        n_predict: maxTokens,
        temperature: temperature,
        top_p: 1,
        n: 1,
        stream: false,
        messages: promptArray,
      }),
    })
      .then(response => {
        if (!response.ok) {
          throw new Error(`Failed to generate OpenAI response:\n${response.statusText} (${response.status}) - ${response.body}\n`);
        }
        return response.json();
      })
      .then(data => {
        if (data.choices && data.choices.length > 0 && data.choices[0].message && data.choices[0].message.content) {
          const aiMessage = data.choices[0].message;
          console.log(`OpenAI response:\n${JSON.stringify(aiMessage, null, 2)}\n`);
          console.log(`OpenAI usage:\n${JSON.stringify(data.usage, null, 2)}\nfinish_reason: ${data.choices[0].finish_reason}\n`);

          gptAnswer = aiMessage.content;
          // remove ! from start of message if it exists
          if (gptAnswer.startsWith('!')) {
            gptAnswer = gptAnswer.substring(1);
          }
          client.say(channel, `  ${aiMessage.content}`);

          lastMessageArray.push({ "role": "assistant", "content": `${aiMessage.content}` });
        } else {
          console.error('No choices returned from OpenAI!\n');
          console.log(`OpenAI response:\n${JSON.stringify(data)}\n`);
        }
      })
      .catch(error => console.error('An error occurred:', error));

    // Introduce a random delay before the bot responds
    await delay(getRandomDelay());

    return;
  }
});
