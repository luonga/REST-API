const express = require('express');
const bodyParser = require('body-parser');
const router = express.Router();
const ds = require('./datastore');
const loads = require('./loads.js');

const datastore = ds.datastore;

const BOAT = "Boat";
const LOAD = "Load";

router.use(bodyParser.json());

const jwt = require('express-jwt');
const jwksRsa = require('jwks-rsa');
const DOMAIN = 'luongan-project.us.auth0.com';

const checkJwt = jwt({
  secret: jwksRsa.expressJwtSecret({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 5,
    jwksUri: `https://${DOMAIN}/.well-known/jwks.json`
  }),

  // Validate the audience and the issuer.
  issuer: `https://${DOMAIN}/`,
  algorithms: ['RS256']
});

/* ------------- Begin Lodging Model Functions ------------- */
function post_boat(name, type, length, owner) {
  const key = datastore.key(BOAT);
  const new_boat = {
    "name": name,
    "type": type,
    "length": length,
    "owner": owner,
    "loads": []
  };
  return datastore.save({ "key": key, "data": new_boat }).then(() => { return key });
}

function getBoat(id) {
  const key = datastore.key([BOAT, parseInt(id, 10)]);
  return datastore.get(key).then((entity) => {
    if (entity[0] === undefined || entity[0] === null) {
      // No entity found. Don't try to add the id attribute
      return entity;
    } else {
      // Use Array.map to call the function fromDatastore. This function
      // adds id attribute to every element in the array entity
      return entity.map(ds.fromDatastore);
    }
  })
}

function get_boats(req, owner) {
  let q = datastore.createQuery(BOAT).limit(5);
  const results = {};

  if (Object.keys(req.query).includes("cursor")) {
    q = q.start(req.query.cursor);
  }

  return datastore.runQuery(q).then((entities) => {
    results.items = entities[0].map(ds.fromDatastore).filter(item => item.owner === owner);
    if (entities[1].moreResults !== ds.Datastore.NO_MORE_RESULTS) {
      results.next = req.protocol + "://" + req.get("host") + req.baseUrl + "?cursor=" + entities[1].endCursor;
    }
    return results;
  });
}

function get_public_boats() {
  const q = datastore.createQuery(BOAT);
  return datastore.runQuery(q).then((entities) => {
    return entities[0].map(ds.fromDatastore).filter(item => item.public === true);
  });
}

function get_boat_loads(id, url) {
  const key = datastore.key([BOAT, parseInt(id, 10)]);
  return datastore.get(key)
    .then((boats) => {
      if (boats[0] === undefined || boats[0] === null) {
        // No entity found. Don't try to add the id attribute
        return undefined;
      }
      const boat = boats[0];
      const load_keys = boat.loads.map((l_id) => {
        return datastore.key([LOAD, parseInt(l_id.id, 10)]);
      });
      return datastore.get(load_keys);
    })
    .then((loads) => {
      if (loads === undefined) {
        return undefined;
      }

      loads = loads[0].map(ds.fromDatastore);
      const updatedLoads = loads.map((id) => {
        return id.self = url + id.id;
      });
      return updatedLoads;
    });
}

function put_boat(id, name, type, length) {
  const key = datastore.key([BOAT, parseInt(id, 10)]);
  const boat = { "name": name, "type": type, "length": length };
  return datastore.save({ "key": key, "data": boat });
}

function patchBoat(id, name, type, length, owner) {
  const key = datastore.key([BOAT, parseInt(id, 10)]);
  return datastore.get(key).then((entity) => {
    if (entity[0] === undefined || entity[0] === null) {
      return undefined;
    }
    else if (entity[0].owner !== owner) {
      return 'wrongOwner';
    }
    else {
      if (name === undefined) {
        name = entity[0].name;
      }
      if (type === undefined) {
        type = entity[0].type;
      }
      if (length === undefined) {
        length = entity[0].length;
      }
      const patchBoat = { "name": name, "type": type, "length": length, "owner": owner };
      return datastore.save({ "key": key, "data": patchBoat });
    }
  });
}

function delete_boat(id, owner) {
  const key = datastore.key([BOAT, parseInt(id, 10)]);
  return datastore.get(key)
    .then((boats) => {
      if (boats[0] === undefined) {
        return undefined;
      }
      else if (boats[0].owner !== owner) {
        return 'wrongOwner';
      }
      const boat = boats[0];
      if (boat.loads) {
        boat.loads.map((l_id) => {
          if (l_id === undefined) {
            return undefined;
          }
          const l_key = datastore.key([LOAD, parseInt(l_id.id, 10)]);
          datastore.get(l_key)
            .then((load) => {
              if (load[0]) {
                load[0].carrier = null;
                datastore.save({ key: l_key, data: load[0] });
              }
            });
        });
      }
      return datastore.delete(key);
    });
}
  
function remove_load(bid, lid) {
  const b_key = datastore.key([BOAT, parseInt(bid, 10)]);
  const l_key = datastore.key([LOAD, parseInt(lid, 10)]);
  keys = [b_key, l_key];
  return datastore.get(keys)
    .then((results) => {
      const boat = results[0][0];
      const load = results[0][1];

      if (boat === undefined) {
        return 'badBoat';
      }

      if (load === undefined || load === null) {
        // No entity found. Don't try to add the id attribute
        return 'badLoad';
      }

      const index = boat.loads.findIndex(item => item.id === lid);

      if (index === -1) {
        return 'badLoad';
      }

      load.carrier.splice(index, 1);
      datastore.save({ key: l_key, data: load });

      boat.loads.splice(index, 1);
      datastore.save({ key: b_key, data: boat });
    });
}

function put_assignment(bid, lid) {
  const b_key = datastore.key([BOAT, parseInt(bid, 10)]);
  const l_key = datastore.key([LOAD, parseInt(lid, 10)]);
  keys = [b_key, l_key];
  return datastore.get(keys)
    .then((results) => {
      const boat = results[0][0];
      const load = results[0][1];

      if (boat === undefined) {
        return undefined;
      }

      if (load === undefined || load === null) {
        // No entity found. Don't try to add the id attribute
        return undefined;
      }

      if (typeof boat.loads === 'undefined') {
        boat.loads = [];
      }

      if (load.carrier === null) {
        load.carrier = [];
      } else if (load.carrier[0]) {
        return 'occupied';
      }

      load.carrier.push({ id: bid });
      datastore.save({ "key": l_key, "data": load });

      boat.loads.push({ id: lid });
      datastore.save({ "key": b_key, "data": boat });

      return boat;
    });
}

/* ------------- End Model Functions ------------- */

/* ------------- Begin Controller Functions ------------- */

router.get('/', function(req, res) {
  checkJwt(req, res, function(err) {
    if (err) {
      res.status(401).send({ 'Error': 'Invalid or missing JWT' });
    } else {
      get_boats(req, req.user.sub)
        .then((boats) => {
          if (boats.items < 6) {
            res.status(200).json({ boats: boats.items });
          } else {
            res.status(200).json({ boats: boats.items, next: boats.next });
          }
        })
        .catch((err) => {
          console.error(err);
          res.status(500).send('Internal Server Error');
        });
    }
  });
});

router.get('/:id', function(req, res) {
  checkJwt(req, res, function(err) {
    if (err) {
      get_public_boats()
        .then((boats) => {
          res.status(401).send({ 'Error': 'Invalid or missing JWT' });
        })
        .catch((err) => {
          console.error(err);
          res.status(500).send('Internal Server Error');
        });
    } else {
      var burl = req.protocol + '://' + req.get('host') + req.baseUrl + '/' + req.params.id;
      getBoat(req.params.id)
        .then(boat => {
          if (boat[0] === undefined || boat[0] === null) {
            res.status(404).json({ 'Error': 'No boat with this boat_id exists' });
          } else {
            if (boat[0].loads[0]) {
              boat[0].loads[0].self = req.protocol + '://' + req.get('host') + '/loads' + '/' + boat[0].loads[0].id;
            }
            boat[0].self = burl;
            res.status(200).send(boat[0]);
          }
        });
    }
  });
});  

router.get('/:id/loads', function(req, res) {
  const self_url = req.protocol + "://" + req.get("host") + req.baseUrl + "/";
  get_boat_loads(req.params.id, self_url)
    .then((loads) => {
      if (loads === undefined) {
        res.status(404).json({ 'Error': "No boat with this boat_id exists" });
      } else {
        res.status(200).send({ loads: loads });
      }
    });
});

router.post('/', function(req, res) {
  if (req.get('content-type') !== 'application/json') {
    res.status(406).send({ 'Error': 'Server only accepts application/json data.' });
  } else {
    checkJwt(req, res, function(err) {
      if (err) {
        get_public_boats()
          .then((boats) => {
            res.status(401).send({ 'Error': "Invalid or missing JWT" });
          })
          .catch((err) => {
            console.error(err);
            res.status(500).send('Internal Server Error');
          });
      } else {
        const self_url = req.protocol + "://" + req.get("host") + req.baseUrl + "/";
        post_boat(req.body.name, req.body.type, req.body.length, req.user.sub)
          .then(key => {
            res.status(201).json({
              id: key.id,
              type: req.body.type,
              name: req.body.name,
              length: req.body.length,
              owner: req.user.sub,
              loads: [],
              self: self_url + key.id
            });
          });
      }
    });
  }
});

router.put('/:id', function(req, res) {
  put_boat(req.params.id, req.body.name, req.body.type, req.body.length)
    .then(() => {
      res.status(200).end();
    });
});

router.put('/:bid/loads/:lid', function(req, res) {
  const lurl = req.protocol + "://" + req.get("host") + "/loads" + "/" + req.params.lid;
  const burl = req.protocol + "://" + req.get("host") + req.baseUrl + "/" + req.params.bid;
  put_assignment(req.params.bid, req.params.lid)
    .then(boat => {
      if (boat === undefined) {
        res.status(404).json({ 'Error': "The specified boat and/or load does not exist" });
      } else if (boat === 'occupied') {
        res.status(403).json({ 'Error': "The load is already loaded on another boat" });
      } else {
        res.status(204).send(boat);
      }
    });
});

router.patch('/:id', function(req, res) {
  const regex = /^[a-zA-Z\- ]+$/;
  const accepts = req.accepts(['application/json']);
  checkJwt(req, res, function(err) {
    if (err) {
      res.status(401).send({ 'Error': 'Invalid or missing JWT' });
    } else {
      if (req.get('content-type') !== 'application/json') {
        res.status(406).send({ 'Error': 'Server only accepts application/json data.' });
      } else if (req.body.id !== undefined) {
        res.status(400).send({ 'Error': 'Updating id value not allowed' });
      } else if (!regex.test(req.body.name) || !regex.test(req.body.type)) {
        res.status(400).send({ 'Error': 'Only letters, space, hyphens allowed' });
      } else if (req.body.length > 2000 || req.body.length < 1) {
        res.status(400).send({ 'Error': 'Invalid boat length, must be between 1 and 2000ft' });
      } else {
        patchBoat(req.params.id, req.body.name, req.body.type, req.body.length, req.user.sub)
          .then(boat => {
            if (boat === undefined) {
              res.status(404).json({ 'Error': 'No boat with this boat_id exists' });
            } else if (boat === 'wrongOwner') {
              res.status(401).send({ 'Error': "Invalid or missing JWT" });
            } else {
              res.status(200).json({ type: req.body.type, name: req.body.name, length: req.body.length, owner: req.user.sub });
            }
          });
      }
    }
  });
});

router.delete('/:id', function(req, res) {
  checkJwt(req, res, function(err) {
    if (err) {
      res.status(401).send({ 'Error': 'Invalid or missing JWT' });
    } else {
      delete_boat(req.params.id, req.user.sub)
        .then(result => {
          if (result === undefined) {
            res.status(404).json({ 'Error': "No boat with this boat_id exists" });
          } else if (result === 'wrongOwner') {
            res.status(401).send({ 'Error': 'Invalid or missing JWT' });
          } else {
            res.status(204).send(result);
          }
        })
        .catch((err) => {
          console.error(err);
          res.status(500).send('Internal Server Error');
        });
    }
  });
});

router.delete('/:bid/loads/:lid', function(req, res) {
  remove_load(req.params.bid, req.params.lid)
    .then(result => {
      if (result === 'badLoad' || result === 'badBoat') {
        res.status(404).json({ 'Error': "No boat with this boat_id is loaded with the load with this load_id" });
      } else {
        res.status(204).send(result);
      }
    });
});

router.delete('/', function(req, res) {
  res.status(405).send({ 'Error': "This method is not allowed" });
});

/* ------------- End Controller Functions ------------- */

module.exports = router;
module.exports.remove_load = remove_load;
