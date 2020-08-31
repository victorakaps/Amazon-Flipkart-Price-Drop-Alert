const ch = require("cheerio");
const CronJob = require("cron").CronJob;
const nodemailer = require("nodemailer");
const rp = require("request-promise");

const { Telegraf } = require("telegraf");
const bot = new Telegraf(BOT_TOKEN);

let users = [];
let curUser;
let link = "";
let key = "";

bot.command("start", (ctx) => {
  ctx.reply(`Hi, ${ctx.chat.first_name}\nTo get Started send email you want to be alerted to like\n /email xyz@gmail.com\nfollowed by /track url where url is the link of product\nfollowed by /price xyz where xyz is min price to be allerted.`)
})

bot.command("help", (ctx) => {
  ctx.reply(`Hi, ${ctx.chat.first_name}\nTo get Started send email like\n /email xyz@gmail.com\nfollowed by /track url where url is the link of product\nfollowed by /price xyz where xyz is min price to be allerted.\nUSe /example to see format.`)
ctx.reply("FIND ME ON GIT: https://github.com/victorakaps")
})

bot.command("example", (ctx) => {
  ctx.reply("/email xyzexample@gmail.com")
  ctx.reply("/track https://www.amazon.in/dp/B01N7K4CEU/ref=cm_sw_r_cp_apa_i_XtqtFb2N5D636")
  ctx.reply("/price 2700")
})

bot.command("email", (ctx) => {
  var str = ctx.message.text;
  str = str.slice(7);
  var user = new Object();
  user.id = ctx.chat.id;
  user.email = str;
  user.tasks = [];
  user.prices = [];
  users.push(user);
});

bot.command("track", (ctx) => {
  var str = ctx.message.text;
  link = str.slice(7);
  let user = users.find((x) => x.id === ctx.chat.id);
  if (user) {
    user.tasks.push(link);
    curPrice(ctx);
  } else {
    ctx.reply("PLEASE SEND A VALID LINK.");
  }
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

async function curPrice(ctx) {
  var options = {
    uri: link,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 6.3; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/38.0.2125.111 Safari/537.36",
    },
  };
  var response = await rp(options);
  var amazon = link.includes("amazon");
  if (amazon) {
    key = "#priceblock_ourprice";
  } else {
    key = "._3qQ9m1";
  }
  ch(key, response).each(function () {
    let price = ch(this).text();
    price = Number(price.replace(/[^0-9.-]+/g, ""));
    ctx.reply(
      `Current price is ${price}.\nSet min price using /price command.\neg: /price ${
        price - 150
      }`
    );
  });
}

async function dosomething(ctx) {
  let user = users.find((x) => x.id === ctx.chat.id);
  curUser = user;
  let n = user.tasks.length;
  if (n > 0) {
    for (i = 0; i < n; i++) {
      link = user.tasks[i];
      let minPrice = user.prices[i];
      var options = {
        uri: link,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 6.3; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/38.0.2125.111 Safari/537.36",
        },
      };
      var response = await rp(options);
      var amazon = link.includes("amazon");
      if (amazon) {
        key = "#priceblock_ourprice";
      } else {
        key = "._3qQ9m1";
      }
      ch(key, response).each(function () {
        let price = ch(this).text();
        price = Number(price.replace(/[^0-9.-]+/g, ""));
        if (price < minPrice) {
          ctx.reply(`Price Dropped to ${price}`);
          ctx.reply(`Email Sent to ${user.email}`);
          ctx.reply(`Buy Now: ${link}`)
          sendNotification(price);
        }
      });
    }
  }
}

async function sendNotification(price) {
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
