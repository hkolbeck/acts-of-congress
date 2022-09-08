const fetch = require("node-fetch");
const fs = require("fs");
const OAuth = require("oauth-1.0a");
const crypto = require("crypto");

const config = {
  congressToken: process.env.CONGRESS_TOKEN,
  twitterBearerToken: process.env.TWITTER_BEARER_TOKEN,
  twitterClientSecret: process.env.TWITTER_CLIENT_SECRET,
  twitterClientId: process.env.TWITTER_CLIENT_ID,
  twitterAccessToken: process.env.TWITTER_ACCESS_TOKEN,
  twitterAccessTokenSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
  twitterApiKey: process.env.TWITTER_API_KEY,
  twitterApiKeySecret: process.env.TWITTER_API_KEY_SECRET,
};

function log(str) {
  console.log(`${new Date().toISOString()}: ${str}`);
}

const erroredFile = ".data/errored";

function saveErrored(errored) {
  fs.writeFileSync(erroredFile, JSON.stringify(errored));
}

function getErrored() {
  try {
    return JSON.parse(fs.readFileSync(erroredFile).toString("utf8"));
  } catch (err) {
    return [];
  }
}

const lastSeenFile = ".data/last_seen";

function saveLastSeen(lastSeen) {
  fs.writeFileSync(lastSeenFile, lastSeen);
}

function getLastSeen() {
  try {
    return fs.readFileSync(lastSeenFile).toString("utf8");
  } catch (err) {
    return null;
  }
}

async function tweet(text) {
  const oauth = OAuth({
    consumer: { key: config.twitterApiKey, secret: config.twitterApiKeySecret },
    signature_method: "HMAC-SHA1",
    hash_function(base_string, key) {
      return crypto
        .createHmac("sha1", key)
        .update(base_string)
        .digest("base64");
    },
  });

  let body = JSON.stringify({ text });
  const authorization = oauth.authorize(
    { method: "POST", url: "https://api.twitter.com/2/tweets" },
    {
      key: config.twitterAccessToken,
      secret: config.twitterAccessTokenSecret,
    }
  );

  return fetch("https://api.twitter.com/2/tweets", {
    method: "POST",
    headers: {
      Authorization: oauth.toHeader(authorization).Authorization,
      "Content-Type": "application/json",
    },
    body: body,
  })
    .then(async (resp) => {
      if (resp.ok) {
        log(`Sent ''${text}''`);
        return true;
      } else {
        log(
          `Failed to send tweet. ${text}: ${resp.status} ${
            resp.statusText
          }: ${await resp.text()}`
        );
        return false;
      }
    })
    .catch((err) => {
      log(`Error tweeting ${text}: ${err}`);
      return false;
    });
}

function billToTweetBody(bill) {
  let text = `${bill.originChamber}: ${bill.latestAction.text}\n${bill.title}`
  if (text.length > 216) {
    text = `${text.slice(0, 214)}…` 
  }
  
  const url = `https://www.congress.gov/bill/${bill.congress}th-congress/${bill.originChamber}-bill/${bill.number}`;
  return `${text}\n${url}`;
}

function poll() {
  return async () => {
    let url = `https://api.congress.gov/v3/bill?api_key=${config.congressToken}&format=json&limit=100`;

    const lastSeen = getLastSeen();
    if (lastSeen) {
      url = `${url}&fromDateTime=${lastSeen}`;
    }

    const erroredThisRound = [];

    log(`Fetching ${url}`);
    fetch(url)
      .then(async (resp) => {
        if (resp.ok) {
          const { bills } = await resp.json();
          if (bills && bills.length && bills.length > 0) {
            for (let bill of bills) {
              const lastAction = Date.parse(bill.latestAction.actionDate);
              if (Date.now() - lastAction <= 3 * 24 * 60 * 60 * 1000) {
                const text = billToTweetBody(bill);
                const sent = await tweet(text);
                if (!sent) {
                  erroredThisRound.push(bill);
                }
              } else {
                log(`Skipping bill, last action was ${bill.latestAction.actionDate}`)
              }
            }

            let newLastSeen = bills[0].updateDateIncludingText;
            saveLastSeen(newLastSeen);
          }
        } else {
          log(`Failure fetching '${url}': ${resp.status} ${resp.statusText}`);
        }
      })
      .catch((err) => {
        log(`Error fetching '${url}': ${err}`);
        console.log(err);
      });

    const previousErrors = getErrored();
    const toRetry = previousErrors.concat(...erroredThisRound);
    log(`Found ${toRetry.length} bills to retry sending`);

    const stillErrored = [];
    for (let bill of toRetry) {
      const text = billToTweetBody(bill);
      const sent = await tweet(text);
      if (!sent) {
        stillErrored.push(bill);
      }
    }

    saveErrored(stillErrored);
  };
}

function run() {
  setInterval(poll(), 10000);
}

run()
