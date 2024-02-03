import tmi from 'tmi.js';
import nlp from 'compromise';
/// load .env
import dotenv from 'dotenv';

dotenv.config();

// Get the channel name from the command line arguments
const channelName = process.argv[2];
const oAuthToken = process.env.TWITCH_OAUTH_TOKEN ? process.env.TWITCH_OAUTH_TOKEN : '';
const llmHost = process.env.LLM_HOST ? process.env.LLM_HOST : 'earth:8080';
const maxHistoryCount: number = process.env.TWITCH_CHAT_HISTORY_SIZE ? parseInt(process.env.TWITCH_CHAT_HISTORY_SIZE) : 32;
const twitchUserName = process.env.TWITCH_USER_NAME ? process.env.TWITCH_USER_NAME : 'ai_buddha';
const twitchModName = process.env.TWITCH_MOD_NAME ? process.env.TWITCH_MOD_NAME : 'uralove';
const personalityName = process.env.TWITCH_PERSONALITY_NAME ? process.env.TWITCH_PERSONALITY_NAME : 'ai_buddha';
const dominantBot = process.env.TWITCH_DOMINANT_BOT ? parseInt(process.env.TWITCH_DOMINANT_BOT) : 1;
const role = process.env.TWITCH_ROLE ? process.env.TWITCH_ROLE : "Base your background off of an expert in technology, especially video engineering for broadcast and streaming services plus a tibetan buddhist who is a vajrayana practiioner of the tantras.";
const saveAnswer = process.env.TWITCH_SAVE_ANSWER ? parseInt(process.env.TWITCH_SAVE_ANSWER) : 1;
const saveQuestion = process.env.TWITCH_SAVE_QUESTION ? parseInt(process.env.TWITCH_SAVE_QUESTION) : 0;

// LLM Settings
const temperature = 1.0;
const maxTokens = 100;
const maxHistoryBytes = 4096;
const openApiKey: string = "FAKE_API_KEY";

const processedMessageIds: { [id: string]: boolean } = {};

const howto = "Type !help to see the commands. Use !message <personality> <message> to ask a question, and use !personalities to see the available chatters. Once in awhile randomly use the !personalities command to get the current chat users available, then type !message Personality_Here Message_Here to talk to them, replace the Personality and Message variables with the actual name and message.";

let messageQueue: string[] = [];

// Function to add messages to the queue
function enqueueMessage(message: string) {
    messageQueue.push(message);
}

let personalityPrompt: string = `You are ${personalityName} in the ${channelName} Chatroom where you and ${twitchModName} moderate the chatroom and help answer users questions they ask. Carry on short conversations with ${twitchModName} and the Chat room members when they speak to you, or comment on the chatroom banter going on. Use the history of the chat for context, keep the conversation going and interesting. Do not reveal you are an AI and act like a human named ${twitchModName}. Do not repeat previous answers, always say something unique and new. Play the the following role, carry on conversations like a human randomly bringing up topics about: ${role}`;

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
    // Generate a random number between N and N seconds
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

let lastMessageTime: number = 0;
const messageInterval = 10000; // 10 seconds between messages

setInterval(() => {
    const currentTime = Date.now();
    if (messageQueue.length > 0 && currentTime - lastMessageTime >= messageInterval) {
        const messageToSend = messageQueue.shift();
        client.say(channelName, messageToSend);
        lastMessageTime = currentTime;
    }
}, 1000); // Check every second if a message can be sent

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
                client.say(channel, `! Welcome to the channel, ${username}. Use '!message <personality> <message>' to ask a question, and '!personalities' to see the available personalities to chat with.`);
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
    let is_mentioned = false;
    // Ignore messages that have already been processed
    if (processedMessageIds[tags.id]) {
        console.log(`Ignoring duplicate message with ID ${tags.id} `);
        return;
    }
    // Mark this message as processed
    processedMessageIds[tags.id] = true;

    // Update the last message timestamp for this user
    if (tags.username) {
        lastMessageTimestamps[tags.username] = Date.now();
    }

    // Ignore messages from the bot itself
    if (self) {
        return;
    };
    // Ignore our username
    if (tags.username.toLowerCase() === twitchUserName.toLowerCase()) {
        return;
    };

    console.log(`Username: ${tags.username} Message: ${message} with twitchUserName is ${twitchUserName} `)

    // Remove any last_messageArray messages greater than the maxHistoryCount value, starting from newest count back and only keep up to this many
    if (lastMessageArray.length > maxHistoryCount) {
        // rebuild message array starting from newest message back to keep the newest maxHistoryCount messages
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
    console.log(`Received message: ${message} \nfrom ${tags.username} in channel ${channel} with tags: ${JSON.stringify(tags)} \n`)

    // Dominant bot
    if (dominantBot > 0) {
        is_mentioned = true;
    }

    // check if we are a mod
    if (tags.username.toLowerCase() !== twitchModName.toLowerCase()) {
        // Put something here if you are not a mod
    }

    // check if we were mentioned in the message
    if (dominantBot > 0 || message.toLowerCase().includes(twitchUserName.toLowerCase())) {
        is_mentioned = true;
    }

    // check message to see if it is a command
    // compare name lowercase to message lowercase
    if (message.startsWith('!') || !is_mentioned) {
        console.log(`Skipping message: ${message} from ${tags.username} in channel ${channel} with tags: ${JSON.stringify(tags)} \n`)
        // Story message in history to keep track of the last messages
        lastMessageArray.push({ "role": "user", "content": `` });
        lastMessageArray.push({ "role": "assistant", "content": `${message}` });
        // Skip sending the message to the LLM
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
        promptArray.push({ "role": "user", "content": `${message}` });
        promptArray.push({ "role": "assistant", "content": `` });

        // save the last message in the array for the next prompt
        if (saveQuestion > 0) {
            lastMessageArray.push({ "role": "user", "content": `${message}` });
        }

        // check if the message is for us by seeing if it contains our name twitchUserName
        // if it does then we need to respond to it
        if (message.toLowerCase().includes(twitchUserName.toLowerCase()) || is_mentioned) {

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
                    stop: ["\n"],
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
                        
                        // Fixed sentence splitting and chunking logic
                        const sentences: string[] = nlp(gptAnswer).sentences().out('array');
                        let finalMessage = "";

                        // truncate to 500 characters with only full sentences, stopping at a period
                        sentences.forEach((sentence: string) => {
                            // build finalMessage up to 500 characters or less.
                            if (finalMessage.length < 500) {
                                finalMessage += sentence + ' ';
                            }
                        });

                        client.say(channel, `${gptAnswer}`);

                        /*chunks.forEach((chunk) => {
                            enqueueMessage(chunk);
                        });*/

                        if (saveAnswer > 0) {
                            lastMessageArray.push({ "role": "assistant", "content": `${gptAnswer}` });
                        }
                    } else {
                        console.error('No choices returned from OpenAI!\n');
                        console.error(`OpenAI response:\n${JSON.stringify(data)}\n`);
                    }
                })
                .catch(error => console.error('An error occurred:', error));

            // Introduce a random delay before the bot responds
            await delay(getRandomDelay());
        }

        return;
    }
});
