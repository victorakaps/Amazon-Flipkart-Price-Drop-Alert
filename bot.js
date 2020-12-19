const ch = require("cheerio");
const CronJob = require("cron").CronJob;
const nodemailer = require("nodemailer");
const axios = require("axios");
const mongoose = require("mongoose");

const { Telegraf } = require("telegraf");
const WizardScene = require("telegraf/scenes/wizard");
const Stage = require("telegraf/stage");
const session = require("telegraf/session");

const { BOT_TOKEN, SENDER_EMAIL, SENDER_PASS, MONGO_URI } = require("./config");

const Product = require("./models/product.js");
const User = require("./models/user.js");

const bot = new Telegraf(BOT_TOKEN);

bot.use(session());

mongoose.connect(MONGO_URI, {
  useCreateIndex: true,
  useNewUrlParser: true,
  useUnifiedTopology: true,
  useFindAndModify: false,
});

mongoose.connection.on("connected", () => {
  console.log("db connected");
  startTracking();
});
mongoose.connection.on("error", () => console.error("error connecting to db"));

let amazonClasses = [
  "#priceblock_saleprice",
  "#priceblock_ourprice",
  "#priceblock_dealprice",
];
let flipkartClasses = ["._30jeq3"];

/* --------------------- wizard scenes ---------------------- */

const newUserWizard = new WizardScene(
  "newUser",
  async (ctx) => {
    await ctx.replyWithMarkdown(
      "*Please enter the email you want to be notified to*"
    );
    ctx.wizard.state.userid = ctx.chat.id;
    return ctx.wizard.next();
  },
  async (ctx) => {
    ctx.wizard.state.email = ctx.message.text;
    bot.telegram.sendMessage(ctx.chat.id, "CLICK ON BELOW BUTTON(s) TO:", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Add a Product", callback_data: "addProductBtn" }],
          [{ text: "BOT's Manual page", callback_data: "helpBtn" }],
        ],
      },
    });
    addUser(ctx.wizard.state);
    return ctx.scene.leave();
  }
);

const addProductWizard = new WizardScene(
  "addProduct",
  async (ctx) => {
    await ctx.replyWithMarkdown("*Please enter the link of the product*");
    ctx.wizard.state.userid = ctx.chat.id;
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!isValidURL(ctx.message.text)) {
      await ctx.replyWithMarkdown("*Invalid URL!*");
      return ctx.scene.leave();
    }
    ctx.wizard.state.url = ctx.message.text;

    ctx.wizard.state.name = await getProductName(ctx.wizard.state.url);
    await ctx.replyWithMarkdown(`*Product is* ${ctx.wizard.state.name}`);
    ctx.wizard.state.initPrice = await curPrice(ctx.wizard.state.url);
    await ctx.replyWithMarkdown(
      `Current price is *${ctx.wizard.state.initPrice}rs*`
    );
    await ctx.replyWithMarkdown(
      "*Enter the price you want to be notified for*"
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    ctx.wizard.state.dropPrice = parseInt(ctx.message.text);
    await ctx.replyWithMarkdown(
      `*Alert added for ${ctx.wizard.state.dropPrice}rs*`
    );
    addProduct(ctx.scene.state);
    handleBtncmd(ctx);

    return ctx.scene.leave();
  }
);

const deleteWizard = new WizardScene(
  "deleteProduct",
  async (ctx) => {
    await ctx.replyWithHTML("★★★ work of @victorakaps ★★★");
    await ctx.replyWithMarkdown(
      "Send The *4-Digit code* of the product that you want to remove.(Send *q* to exit)"
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (ctx.message.text.toLowerCase() === "q") {
      return ctx.scene.leave();
    } else {
      uniqid = ctx.message.text;
      Product.findOne({ uniqid }).exec((err, product) => {
        if (err || !product) {
          ctx.replyWithMarkdown("*Something went wrong!*");
          console.log(err);
        } else {
          product
            .remove()
            .then((product) => {
              ctx.replyWithMarkdown(`*Removed* ${product.name}`);
              handleBtncmd(ctx);
            })
            .catch((err) => {
              console.log(err);
            });
        }
      });
    }
    return ctx.scene.leave();
  }
);

/* ----------------------------------------------------------------- */

const stage = new Stage([newUserWizard, addProductWizard, deleteWizard]);
bot.use(stage.middleware());

/* -------------------------- bot events --------------------------- */

bot.start(async (ctx) => {
  ctx.scene.enter("newUser");
});

bot.command("add", (ctx) => {
  ctx.scene.enter("addProduct");
});

bot.command("kick", (ctx) => {
  handleKickcmd(ctx);
});

bot.command("log", async (ctx) => {
  handleLogging(ctx);
});

bot.command("list", async (ctx) => {
  handleDeletecmd(ctx);
});

bot.command("help", async (ctx) => {
  handleHelp(ctx);
});

bot.command("btn", async (ctx) => {
  handleBtncmd(ctx);
});

bot.action("addProductBtn", (ctx) => {
  ctx.deleteMessage();
  ctx.scene.enter("addProduct");
});

bot.action("deleteBtn", (ctx) => {
  ctx.deleteMessage();
  handleDeletecmd(ctx);
});

bot.action("kickBtn", (ctx) => {
  ctx.deleteMessage();
  handleKickcmd(ctx);
});
bot.action("helpBtn", (ctx) => {
  ctx.deleteMessage();
  handleHelp(ctx);
});

/* -------------------------------------------------------------------- */

/* ----------------------- command handlers --------------------------- */

const handleBtncmd = async (ctx) => {
  bot.telegram.sendMessage(ctx.chat.id, "CLICK ON BELOW BUTTON(s) TO:", {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "Add a Product for tracking",
            callback_data: "addProductBtn",
          },
        ],
        [
          {
            text: "Display Or Delete saved product(s)",
            callback_data: "deleteBtn",
          },
        ],
        [
          {
            text: "Resume/Pause Notifications",
            callback_data: "kickBtn",
          },
        ],
        [{ text: "BOT's Manual page", callback_data: "helpBtn" }],
      ],
    },
  });
};

const handleKickcmd = async (ctx) => {
  User.findOne({ userid: ctx.chat.id }).then(({ _id, pause }) => {
    pause = !pause;
    User.findByIdAndUpdate(
      _id,
      { $set: { pause } },
      { new: true },
      (err, res) => {
        if (err) {
          console.log(err);
        } else {
          ctx.replyWithMarkdown(
            `*Tracking ${res.pause ? "Paused" : "Resumed"}*`
          );
        }
      }
    );
  });
};

const handleDeletecmd = async (ctx) => {
  Product.find({ userid: ctx.chat.id }).then(async (products) => {
    if (products.length) {
      products.forEach(async (product, i) => {
        await ctx.replyWithMarkdown(
          `☛ ${product.name.slice(0, 40)} CODE => *${product.uniqid}*`
        );
      });
      ctx.scene.enter("deleteProduct");
    } else {
      await ctx.replyWithHTML(
        "★ Tracking list is Empty use /add command to track products. ★"
      );
      await ctx.replyWithHTML("★★★ work of @victorakaps ★★★");
      handleBtncmd(ctx);
    }
  });
};

const handleHelp = async (ctx) => {
  ctx.replyWithMarkdown(
    "*ALL AVAILABLE COMMANDS:*\n✔ USE /add command to track a product \n✔USE /list command to display and delete product(s)\n✔USE /kick command to pause the notifications."
  );
  handleBtncmd(ctx);
};

const handleLogging = async (ctx) => {
  if (ctx.chat.id == 601430671) {
    User.find().then((users) => {
      let userStr = users.map(({ email, userid }) => ({ email, userid }));
      bot.telegram.sendMessage(601430671, userStr);
    });
  }
};

/* ---------------------------------------------------------------------- */

/* ---------------------- Utility functions ----------------------------- */

async function getProductName(url) {
  let key;
  let productName;
  url.includes("amazon") ? (key = "#title") : (key = ".B_NuCI");
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
    productName = ch(this).text().trim();
  });
  return productName;
}

async function scrapPrice(key, response) {
  let price;
  ch(key, response).each(function () {
    price = ch(this).text();
    price = Number(price.replace(/[^0-9.-]+/g, ""));
  });
  return price;
}

async function curPrice(url) {
  let isAmazon = url.includes("amazon");
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
  if (isAmazon) {
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

function isValidURL(string) {
  var res = string.match(
    /(http(s)?:\/\/.)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/g
  );
  return res !== null;
}

const trackPrices = async () => {
  Product.find().then((products) => {
    products.forEach(
      async ({ name, anydrop, url, userid, initPrice, dropPrice, email }) => {
        name = name.slice(0, 15);
        const nowPrice = await curPrice(url);
        if (nowPrice <= dropPrice) {
          sendNotification(name, nowPrice, url, email, userid);
        }
      }
    );
  });
};

async function sendNotification(name, nowPrice, url, email, userid) {
  User.find({ userid }).then((user) => {
    if (!user[0].pause) {
      console.log("sending message");
      bot.telegram.sendMessage(
        userid,
        `Price of ${name} *dropped to ${nowPrice}Rs*, [Click here](${url}) to buy now`,
        { parse_mode: "MarkdownV2" }
      );
      sendEmail(name, nowPrice, url, email);
    }
  });
}

async function sendEmail(name, nowPrice, url, email) {
  try {
    let transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: SENDER_EMAIL,
        pass: SENDER_PASS,
      },
    });
    let textToSend = `Price of ${name} has dropped to ${nowPrice}Rs., thanks for using VictorBot(s)`;
    let htmlText = `<a href=\"${url}\">Click Here To Buy Now</a>`;
    let info = await transporter.sendMail({
      from: `"Victor Price Tracker" <${SENDER_EMAIL}>`,
      to: email,
      subject: "Price dropped to " + nowPrice,
      text: textToSend,
      html: htmlText,
    });
  } catch (err) {
    console.error(err);
  }
}

const addUser = ({ email, userid }) => {
  const user = new User({
    email,
    userid,
  });
  user
    .save()
    .then((savedUser) => {
      console.log("added new user");
      bot.telegram.sendMessage(
        601430671,
        `new user signedup ~ ${savedUser.email} ~ ${savedUser.userid}`
      );
    })
    .catch((err) => console.log(err));
};
const addProduct = ({ url, userid, name, initPrice, dropPrice }) => {
  let uniqid = "";
  const possible = "123456789";
  for (let i = 0; i < 4; i++) {
    let sup = Math.floor(Math.random() * possible.length);
    uniqid += i > 0 && sup == i ? "0" : possible.charAt(sup);
  }
  User.findOne({ userid }).then(({ email }) => {
    const product = new Product({
      url,
      userid,
      name,
      initPrice,
      dropPrice,
      email,
      uniqid,
    });
    product
      .save()
      .then((addedProduct) => {
        console.log("added new product");
      })
      .catch((err) => console.log(err));
  });
};

async function startTracking() {
  let job = new CronJob(
    "*/5 * * * *", // checking every 5 minutes
    function () {
      trackPrices();
    },
    null,
    true,
    null,
    null,
    true
  );
  job.start();
}

/* ------------------------------------------------------------- */

bot.launch();
