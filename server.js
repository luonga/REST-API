const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const jwt = require('express-jwt');
const jwksRsa = require('jwks-rsa');
const json2html = require('json-to-html');
const ds = require('./datastore');

const USER = "User";
const CLIENT_ID = '';
const CLIENT_SECRET = '';
const DOMAIN = 'luongan-project.us.auth0.com';

const datastore = ds.datastore;

app.use(bodyParser.json());

const { auth, requiresAuth } = require('express-openid-connect');

const config = {
  authRequired: false,
  auth0Logout: true,
  baseURL: 'https://luongan-project.uw.r.appspot.com/',
  clientID: CLIENT_ID,
  issuerBaseURL: `https://${DOMAIN}`,
  secret: 'LONG_RANDOM_STRING',
};

app.use(auth(config));

app.get('/', (req, res) => {
  const isAuthenticated = req.oidc.isAuthenticated();
  if (isAuthenticated) {
    const key = datastore.key(USER);
    const new_user = { "name": req.oidc.user.name, "uniqueID": req.oidc.idTokenClaims.sub };
    datastore.save({ "key": key, "data": new_user });
  }

  const loginButton = isAuthenticated ? '' : `<button onclick="window.location.href='https://luongan-project.uw.r.appspot.com/login'">Login page</button>`;
  const userInfoButton = isAuthenticated ? `<button onclick="window.location.href='https://luongan-project.uw.r.appspot.com/profile'">User info</button>` : '';
  
  res.send(`
    <html>
      <header>
        <h1>Welcome to Anni's Final Project</h1>
      </header>

      <body>
        <p>Click on the button below to create or login to an account via Auth0.</p>
        ${loginButton}
        <p>${isAuthenticated ? 'You are logged in. Please click on the button below to see your user info.' : 'You are not logged in.'}</p>
        ${userInfoButton}
        <p>Click on the button below to logout.</p>
        <button onclick="window.location.href='https://luongan-project.uw.r.appspot.com/logout'">Logout</button>
      </body>
    </html>
  `);
});

app.get('/callback', requiresAuth(), (req, res) => {
  res.redirect('/profile');
});

app.get('/profile', requiresAuth(), (req, res) => {
  const JWT = req.oidc.idToken;
  const userName = req.oidc.user.name;
  const sub = req.oidc.idTokenClaims.sub;
  
  res.send(`
    <html>
      <header>
        <h1>User info</h1>
      </header>
  
      <body>
        <button onclick="window.location.href='https://luongan-project.uw.r.appspot.com/login'">Go back</button>
        <p>User Name: ${userName}</p>
        <p>JWT Token: ${JWT}</p>
        <p>User's unique ID: ${sub}</p>
      </body>
    </html>
  `);
});

function delete_user(id) {
  const key = datastore.key([USER, parseInt(id, 10)]);
  return datastore.get(key).then((entity) => {
    if (!entity[0]) {
      return entity;
    } else {
      return datastore.delete(key);
    }
  });
}

function get_users() {
  const q = datastore.createQuery(USER);
  return datastore.runQuery(q).then((entities) => {
    return entities[0].map(ds.fromDatastore);
  });
}

app.get('/users', function (req, res) {
  get_users().then((users) => {
    res.status(200).json(users);
  });
});

app.delete('/:id', function (req, res) {
  delete_user(req.params.id).then(() => {
    res.status(204).end();
  });
});

const checkJwt = jwt({
  secret: jwksRsa.expressJwtSecret({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 5,
    jwksUri: `https://${DOMAIN}/.well-known/jwks.json`
  }),

  issuer: `https://${DOMAIN}/`,
  algorithms: ['RS256']
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}...`);
});
