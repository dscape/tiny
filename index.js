var http    = require('http')
  , url     = require('url')
  , levelup = require('levelup')
  , db      = levelup('./tiny')
  ;

//
// simple generation of short urls with auto retry
//
function generate_short(cb, retries) {
  retries = retries || 1;
  //
  // max out at `8`. just cause
  //
  if(retries > 8) {
    return cb(new Error('something very strange is happening!'));
  }

  //
  // generate a key
  // this is just sample code, in production you are much better
  // just using bigger keys and getting less colisions
  //
  var attempt = (~~(Math.random() * 1e9)).toString(36).substring(0,retries);

  //
  // see if this key is already in leveldb
  //
  db.get('short:' + attempt, function (err) {
    //
    // its not? lets use it
    //
    if(err) {
      cb(null, attempt);
      return;
    }

    //
    // retry
    //
    generate_short(cb, retries+1);
  });
}

http.createServer(function (req, res) {
  console.log(req.url);
  //
  // create a new url
  //
  if(/\/create/.exec(req.url)) {
    //
    // parse our query string
    //
    var query = url.parse(req.url, true).query;

    //
    // if we dont have `url=foobar` then its basically a sh*t
    // request
    //
    if(!query.url) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('`url` is required');
      return;
    }

    //
    // do some basic sanity check on the url, since we are redirecting
    // people to this
    //
    if(!/https?/.exec(query.url)) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('`url` is invalid: '+ query.url);
      return;
    }

    //
    // lets see if this was already stored in our database
    //
    db.get('long:' + query.url, function (err, value) {
      //
      // not likely there, so lets create it
      //
      if (err) {
        generate_short(function (err, uuid) {
          //
          // we couldnt do this
          //
          if(err) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('sad panda, we failed you');
            return;
          }
          //
          // since we have an unused uuid lets store it
          //
          db.batch(
            [ { type: 'put', key: 'short:' + uuid    , value: query.url }
            , { type: 'put', key: 'long:' + query.url, value: uuid      }
            ], function (err) {
            //
            // probably out of disk space or really nasty conditions
            //
            if (err) {
              res.writeHead(500, { 'Content-Type': 'text/plain' });
              res.end('sad panda, we have a broken server. need disk?');
              return;
            }
            //
            // send the stuff man
            //
            res.end(value);
          });
        });
        return;
      }

      //
      // found in the database, just return it
      //
      res.end(value);
    });
  } else {
    //
    // get what the person is looking for
    //
    var uuid = req.url.split('/')[1];

    //
    // fetch that url from leveldb
    //
    db.get('short:' + uuid, function (err, value) {
      //
      // not found means 4040
      //
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end();
        return;
      }

      //
      // redirect the user
      //
      res.writeHead(302, {'Location': value});
      res.end();
    });
  }
}).listen(process.env.PORT || 6385);

console.log('curl localhost:' + (process.env.PORT || 6385));