const express = require('express');
const path = require('path');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const yup = require('yup');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const { nanoid } = require('nanoid');

require('dotenv').config();

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      useFindAndModify: false,
      useCreateIndex: true
    });
    console.log(`MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    console.log(error);
    process.exit(1);
  }
};
connectDB();

const UrlsSchema = new mongoose.Schema({
  slug: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  url: {
    type: String,
    required: true,
  },
  clicks: {
    type: Number,
    default: 0,
  }
}, {
  timestamps: true
});

const Urls = mongoose.model('Urls', UrlsSchema);

const app = express();
app.enable('trust proxy');
app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'","'unsafe-eval'", "unpkg.com"],
      imgSrc: ["'self'","i.imgur.com"],
      styleSrc: ["'self'", "fonts.googleapis.com", "fonts.gstatic.com"],
      fontSrc: ["'self'", "fonts.googleapis.com", "fonts.gstatic.com"],
    },
  })
);
app.use(morgan('common'));
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const notFoundPath = path.join(__dirname, 'public/404.html');

app.get('/:id', async (req, res) => {
  const { id: slug } = req.params;
  try {
    const url = await Urls.findOne({ slug });
    if(url) {
      clicks = url.clicks + 1;
      await Urls.updateOne({ slug }, { clicks });
      return res.redirect(url.url);
    }
    return res.status(404).sendFile(notFoundPath);
  } catch (error) {
    console.log(error);
    return res.status(404).sendFile(notFoundPath);
  }
});

const schema = yup.object().shape({
  slug: yup.string().trim().matches(/[\w\-)]/i),
  url: yup.string().trim().url().required(),
});

app.post('/url', slowDown({
  windowMs: 30 * 1000,
  delayAfter: 1,
  delayMs: 500,
}), rateLimit({
  windowMs: 30 * 1000,
  max: 1,
}), async (req, res, next) => {
  console.log(req.body);
  let { slug, url } = req.body;

  try {
    await schema.validate({
      slug,
      url
    });
    if (url.includes('cdg.sh')) {
      throw new Error('Stop it. 🛑');
    }

    if (!slug) {
      slug = nanoid(5);
    }

    slug = slug.toLowerCase();

    const newUrl = {
      url,
      slug,
      clicks: 0,
    }

    const created = await Urls.create(newUrl);

    res.json(created);
    //
  } catch (error) {
    if (error.message.startsWith('E11000')) {
      error.message = 'Slug in use. 🛠';
    }
    next(error);
  }
});

app.use((req, res, next) => {
  res.status(404).sendFile(notFoundPath);
});

app.use((error, req, res, next) => {
  if (error.status) {
    res.status(error.status);
  } else {
    res.status(500);
  }
  res.json({
    message: error.message,
    stack: process.env.NODE_ENV === 'production' ? '🍳🥘🥞' : error.stack,
  })
});

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Listening at http://localhost:${port}`);
});
