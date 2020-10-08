const ch = require("cheerio");
const CronJob = require("cron").CronJob;
const nodemailer = require("nodemailer");
const axios = require("axios");
const fs = require("fs");
const { Telegraf } = require("telegraf");

let { data } = require("./data");

const BOT_TOKEN = process.env.BOT_TOKEN;
const SENDER_EMAIL = process.env.SENDER_EMAIL;
const SENDER_PASS = process.env.SENDER_PASS;

const bot = new Telegraf(BOT_TOKEN);
let users = data;
let curUser;
let link = "";
let amazonClasses = [
  "#priceblock_saleprice",
  "#priceblock_ourprice",
  "#priceblock_dealprice",
];
let flipkartClasses = ["._3qQ9m1"];

const updateData = () => {
  let ass = `module.exports = {
    data: ${JSON.stringify(users)}
  };`;
  fs.writeFileSync("./data.js", ass);
};

bot.command("start", (ctx) => {
  ctx.reply(
    `Hi, ${ctx.chat.first_name}\nTo get Started send email you want to be alerted to like\n /email xyz@gmail.com\nfollowed by /track url where url is the link of product\nfollowed by /price xyz where xyz is min price to be allerted.`
  );
  let userExists = users.find((x) => x.id === ctx.chat.id);
  if (!userExists) {
    let user = new Object();
    user.id = ctx.chat.id;
    user.email = "";
    user.tasks = [];
    user.prices = [];
    user.initPrice = [];
    user.productName = [];
    user.anydrop = false;
    user.kick = true;
    users.push(user);
  } else {
    user = userExists;
  }
  updateData();
});

bot.command("help", (ctx) => {
  ctx.reply(
    `Hi, ${ctx.chat.first_name}\nTo get Started send email like\n /email xyz@gmail.com\nfollowed by /track url where url is the link of product\nfollowed by /price xyz where xyz is min price to be allerted.\nUSe /example to see format.\n USe /kick to pause/resume notifications\nUse /anydrop to get notified for any drop in price.\nUse /list command to see your saved products.`
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
  let str = ctx.message.text;
  str = str.slice(7);
  user.email = str;
  updateData();
});

async function scrapProductName(url) {
  let key;
  url.includes("amazon") ? (key = "title") : (key = "._35KyD6");
  let response;
  await axios({
    method: "get",
    url: url,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 6.3; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/38.0.2125.111 Safari/537.36",
    },
  }).then((res) => (response = res.data));
  ch(key, response).each(function () {
    productName = ch(this).text();
  });
  return productName;
}

bot.command("list", (ctx) => {
  let user = users.find((x) => x.id === ctx.chat.id);
  let msgString = "";
  if (user.tasks.length) {
    for (let i = 0; i < user.tasks.length; i++) {
      msgString += `${i + 1}. ${user.productName[i]}\n`;
      msgString += "\n";
    }
    msgString +=
      "\nTo delete an item use /delete followed by its serial number.\nLike /delete 1";
    ctx.reply(msgString);
  }
});

bot.command("delete", (ctx) => {
  let user = users.find((x) => x.id === ctx.chat.id);
  let prodNum = ctx.message.text;
  prodNum = +prodNum.slice(8);
  let i = prodNum - 1;
  if (prodNum >= 1 && prodNum <= user.tasks.length) {
    ctx.reply(`Delted ${user.productName[i]} from the list.`);
    user.prices[i] = null;
    user.tasks[i] = null;
    user.initPrice[i] = null;
    user.productName[i] = null;
  }
});

bot.command("track", async (ctx) => {
  let str = ctx.message.text;
  link = str.slice(7);
  let user = users.find((x) => x.id === ctx.chat.id);
  if (user) {
    user.tasks.push(link);
    let price = await curPrice(link);
    if (price) {
      user.initPrice.push(price);
      ctx.reply(
        `Current price is ${price}.\nSet min price using /price command.\neg: /price ${Math.floor(
          price - price * 0.1
        )}`
      );
    } else {
      ctx.reply("Something went wrong, maybe product is out of stock.");
    }
  } else {
    ctx.reply("PLEASE SEND A VALID LINK.");
  }
  let prodName = await scrapProductName(link);
  prodName = prodName.replace("\n", "");
  user.productName.push(prodName);
  updateData();
});

bot.command("log", (ctx) => {
  console.log(users);
});

bot.command("anydrop", (ctx) => {
  let user = users.find((x) => x.id === ctx.chat.id);
  user.anydrop = true;
});

bot.command("kick", (ctx) => {
  let user = users.find((x) => x.id === ctx.chat.id);
  user.kick = !user.kick;
});

bot.command("price", (ctx) => {
  let str = ctx.message.text;
  price = str.slice(7);
  let user = users.find((x) => x.id === ctx.chat.id);
  if (user) {
    user.prices.push(price);
    startTracking(ctx);
    ctx.reply(`Intiated Alert for ${price}Rs.`);
    updateData();
  } else {
    ctx.reply("YOU MUST SEND PRICE.");
  }
});

async function scrapPrice(key, response) {
  let price;
  ch(key, response).each(function () {
    price = ch(this).text();
    price = Number(price.replace(/[^0-9.-]+/g, ""));
  });
  return price;
}

async function curPrice(url) {
  let amazon = url.includes("amazon");
  let price;

  let response;
  await axios({
    method: "get",
    url: url,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 6.3; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/38.0.2125.111 Safari/537.36",
    },
  }).then((res) => (response = res.data));
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
      price = await scrapPrice(flipkartClasses[i], response);
      if (price) {
        break;
      } else {
        continue;
      }
    }
  }
  return price;
}

async function checkTasks(ctx) {
  let user = users.find((x) => x.id === ctx.chat.id);
  curUser = user;
  let n = user.tasks.length;
  if (n > 0) {
    for (i = 0; i < n; i++) {
      if (user.tasks[i]) {
        link = user.tasks[i];
        let minPrice = user.prices[i];
        price = await curPrice(link);
        if (
          user.kick &&
          (price < minPrice || (user.anydrop && price < initPrice))
        ) {
          ctx.reply(`Price Dropped to ${price}`);
          ctx.reply(`Email Sent to ${user.email}`);
          ctx.reply(`Buy Now: ${link}`);
          sendNotification(price);
          user.prices[i] = null;
          user.tasks[i] = null;
          user.initPrice[i] = null;
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
      checkTasks(ctx);
      updateData();
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
