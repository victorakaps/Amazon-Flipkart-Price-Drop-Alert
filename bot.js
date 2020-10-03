const ch = require("cheerio");
const CronJob = require("cron").CronJob;
const nodemailer = require("nodemailer");
const rp = require("request-promise");
const { Telegraf } = require("telegraf");

const BOT_TOKEN = "YOUR BOT TOKEN GOES HERE";
const SENDER_EMAIL = "EMAIL ADRESS FROM WHICH YOU WANT TO SEND NOTIFICATIONS";
const SENDER_PASS = "EMAIL PASSWORD";

const bot = new Telegraf(BOT_TOKEN);

let users = [];
let curUser;
let link = "";
let amazonClasses = [
  "#priceblock_saleprice",
  "#priceblock_ourprice",
  "#priceblock_dealprice",
];
let flipkartClasses = ["._3qQ9m1"];

bot.command("start", (ctx) => {
  ctx.reply(
    `Hi, ${ctx.chat.first_name}\nTo get Started send email you want to be alerted to like\n /email xyz@gmail.com\nfollowed by /track url where url is the link of product\nfollowed by /price xyz where xyz is min price to be allerted.`
  );
  var user = new Object();
  user.id = ctx.chat.id;
  user.email = "";
  user.tasks = [];
  user.prices = [];
  user.initPrice = [];
  user.anydrop = false;
  users.push(user);
});

bot.command("help", (ctx) => {
  ctx.reply(
    `Hi, ${ctx.chat.first_name}\nTo get Started send email like\n /email xyz@gmail.com\nfollowed by /track url where url is the link of product\nfollowed by /price xyz where xyz is min price to be allerted.\nUSe /example to see format.`
  );
  ctx.reply("FIND ME ON GIT: https://github.com/victorakaps");
});

bot.command("example", (ctx) => {
  ctx.reply("/email xyzexample@gmail.com");
  ctx.reply(
    "/track https://www.amazon.in/dp/B01N7K4CEU/ref=cm_sw_r_cp_apa_i_XtqtFb2N5D636"
  );
  ctx.reply("/price 2700");
});

bot.command("email", (ctx) => {
  let user = users.find((x) => x.id === ctx.chat.id);
  var str = ctx.message.text;
  str = str.slice(7);
  user.email = str;
});

bot.command("track", async (ctx) => {
  var str = ctx.message.text;
  link = str.slice(7);
  let user = users.find((x) => x.id === ctx.chat.id);
  if (user) {
    user.tasks.push(link);
    let price = await curPrice(link);
    user.initPrice.push(price);
    ctx.reply(
      `Current price is ${price}.\nSet min price using /price command.\neg: /price ${
        price - 150
      }`
    );
  } else {
    ctx.reply("PLEASE SEND A VALID LINK.");
  }
});

bot.command("anydrop", (ctx) => {
  let user = users.find((x) => x.id === ctx.chat.id);
  user.anydrop = true;
});

bot.command("price", (ctx) => {
  var str = ctx.message.text;
  price = str.slice(7);
  let user = users.find((x) => x.id === ctx.chat.id);
  if (user) {
    user.prices.push(price);
    console.log(user);
    startTracking(ctx);
    ctx.reply(`Intiated Alert for ${price}Rs.`);
  } else {
    ctx.reply("YOU MUST SEND PRICE.");
  }
});

async function scrapPrice(key, response) {
  let price;
  ch(key, response).each(function () {
    price = ch(this).text();
    console.log(price);
    price = Number(price.replace(/[^0-9.-]+/g, ""));
  });
  return price;
}

async function curPrice(url) {
  var amazon = url.includes("amazon");
  let price;
  var options = {
    uri: url,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 6.3; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/38.0.2125.111 Safari/537.36",
    },
  };
  var response = await rp(options);
  if (amazon) {
    for (let i = 0; i < amazonClasses.length; i++) {
      price = await scrapPrice(amazonClasses[i], response);
      if (price) {
        break;
      } else {
        continue;
      }
    }
  } else {
    for (let i = 0; i < flipkartClasses.length; i++) {
      price = scrapPrice(flipkartClasses[i], response);
      if (price) {
        break;
      } else {
        continue;
      }
    }
  }
  return price;
}

async function dosomething(ctx) {
  let user = users.find((x) => x.id === ctx.chat.id);
  curUser = user;
  let n = user.tasks.length;
  if (n > 0) {
    for (i = 0; i < n; i++) {
      if (user.tasks[i]) {
        link = user.tasks[i];
        let minPrice = user.prices[i];
        price = await curPrice(link);
        if (price < minPrice || (user.anydrop && price < initPrice)) {
          ctx.reply(`Price Dropped to ${price}`);
          ctx.reply(`Email Sent to ${user.email}`);
          ctx.reply(`Buy Now: ${link}`);
          sendNotification(price);
          console.log(users);
          user.prices[i] = null;
          user.tasks[i] = null;
          console.log(users);
        }
      }
    }
  }
}

async function sendNotification(price) {
  try {
    let transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: SENDER_EMAIL,
        pass: SENDER_PASS,
      },
    });

    let textToSend = "Price dropped to " + price;
    let htmlText = `<a href=\"${link}\">Click Here To Buy Now</a>`;

    let info = await transporter.sendMail({
      from: `"Victor Price Tracker" <${SENDER_EMAIL}>`,
      to: curUser.email,
      subject: "Price dropped to " + price,
      text: textToSend,
      html: htmlText,
    });
  } catch (e) {
    console.error(e);
  }
}

async function startTracking(ctx) {
  let job = new CronJob(
    "* */30 * * * *",
    function () {
      dosomething(ctx);
    },
    null,
    true,
    null,
    null,
    true
  );
  job.start();
}

bot.launch();
