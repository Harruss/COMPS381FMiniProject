var MongoClient = require('mongodb').MongoClient;
var express = require('express');
var app = express();
var multer = require('multer');
var upload = multer({
    storage: multer.memoryStorage()
});
var http = require('http');
var path = require('path');
var url = require('url');
var assert = require('assert');
var session = require('cookie-session');
var ObjectId = require('mongodb').ObjectID;
var bodyParser = require('body-parser');
var mongoURL = "mongodb://harus:a1b9c2d8@ds155653.mlab.com:55653/mproject";
var fs = require('fs');
app.use(bodyParser.urlencoded({
    extended: false
}));
app.use(bodyParser.json());
app.use(session({
    keys: ['username', 'authorized'],
    maxAge: (10 * 60 * 1000)
}));
app.set('view engine', 'ejs');
app.use(function (req, res, next) {
    //console.log("Session :" + JSON.stringify(req.session) + " Checking: " + req.session.isPopulated + " req.headers: " + JSON.stringify(req.headers));
    //console.log(new Date(Date.now()).getTime().toString());

    if (!req.session.isPopulated && (req.path != '/login' && req.path != '/signup')) {
        console.log("Session expired");
        //console.log("Req checking: " + (req.headers.hasOwnProperty('resource') && req.headers.resource == 'ajax'));
        if (req.headers.hasOwnProperty('resource') && req.headers.resource == 'ajax') {
            res.status(200).send("/login");
            return
        } else {
            res.render('login', {
                result: ''
            });
            return
        }
    }
    next();
});
app.use('/api/restaurant/create/:username', function (req, res, next) {
    if (req.params.username && req.body.name) {
        //console.log(req.params.username);
        req.session.username = req.params.username;
        next();
    } else {
        res.status(200).end(JSON.stringify({
            status: 'failed'
        }));
    }
});

app.use('/api/restaurant/read/:key/:value', function (req, res, next) {
    if (req.params.key && req.params.value) {
        console.log("Request query: " + req.params.key);
        next()
    } else {
        res.status(200).end('{}');
    }
});

app.route('/').get(function (req, res) {
    res.redirect('/login');
});
/*---------------------------------CURL---------------------------------------*/
app.post('/api/restaurant/create/:username', function (req, res, next) {
    MongoClient.connect(mongoURL, {
        useNewUrlParser: true
    }, function (err, client) {
        assertion(err);
        let db = client.db('mproject');
        var rData = new Object();
        rData.body = req.body;
        rData.file = new Object();
        rData.session = {
            username: req.session.username
        };
        if (rData.body.hasOwnProperty('photo')) {
            if (rData.body.photo.indexOf('http') >= 0) {
                console.log(JSON.stringify(rData.body.hasOwnProperty('photo')));
                getImageFromURL(rData.body.photo, function (result, mime) {
                    rData.file.buffer = result
                    rData.file.mimetype = mime;
                    console.log(JSON.stringify(rData));
                    createNewRecord(db, constructDocument(rData), function (result, doc) {
                        if (result) {
                            res.status(200).end(JSON.stringify({
                                status: 'ok',
                                _id: doc
                            }));
                        } else {
                            res.end(JSON.stringify({
                                status: 'failed'
                            }));
                        }
                    }, true);
                });
                //console.log(JSON.stringify("rData structure: " + JSON.stringify(rData.file)));
            } else {
                rData.body.photo = rData.body.photo.replace("file://", "");
                fs.open(rData.body.photo, 'r', function (err, result) {
                    if (err) {
                        console.log(err.message);
                        return;
                    }
                    let buf = new Buffer(100000);
                    fs.readFile(result, function (err, data) {
                        assertion(err);
                        //onsole.log("Buffer: " + data);
                        rData.file.buffer = data;
                        rData.file.mimetype = path.extname(rData.body.photo).replace(/^[\.]/, 'image/');
                        createNewRecord(db, constructDocument(rData), function (result, doc) {
                            if (result) {
                                res.status(200).end(JSON.stringify({
                                    status: 'ok',
                                    _id: doc
                                }));
                            } else {
                                res.end(JSON.stringify({
                                    status: 'failed'
                                }));
                            }
                        }, true);
                    });
                });
            }
        }
    });
});

app.get('/api/restaurant/read/:key/:value', function (req, res, next) {
    MongoClient.connect(mongoURL, {
        useNewUrlParser: true
    }, function (err, client) {
        assertion(err);
        let db = client.db('mproject');
        let data = new Object();
        data[req.params.key] = req.params.value;
        retrieveData(db, data, function (result, docs = null) {
            if (result) {
                res.status(200).end(JSON.stringify(docs));
            } else {
                res.status(200).end('{}');
            }
        })
    });
});
/*----------------------Login & Logout-------------------------------------------- */
app.route('/login').get(function (req, res, next) {
    if (req.session.hasOwnProperty("authorized")) {
        if (req.session.authorized === true) {
            res.redirect('/read');
        }
    }
    res.render('login', {
        result: ''
    });
}).post(upload.none(), function (req, res, next) {
    MongoClient.connect(mongoURL, function (err, client) {
        assertion(err);
        console.log('Connected to MongoDB');
        var db = client.db('mproject');
        login(db, req.body, function (result, data = null) {
            client.close();
            if (result) {
                console.log("login success");
                req.session.authorized = true;
                req.session.username = data.username;
                res.redirect('/read');
            } else {
                res.render('login', {
                    result: "Wrong username or password"
                });
            }
        });
    });
});

app.route("/").get(function (req, res, next) {
    res.redirect('/login');
}).post(function (req, res) {
    res.redirect('/login');
});

app.get('/logout', function (req, res, next) {
    req.session = null;
    res.redirect('/login');
});

/*-----------------------------------Sign Up---------------------------------------*/

app.route('/signup').get(function (req, res, next) {
    if (req.session.hasOwnProperty('authorized') && req.session.authorized === true) {
        res.redirect('/read');
    }
    res.render('signup', {
        result: ''
    });
}).post(upload.none(), function (req, res, next) {
    console.log("Sign post: " + JSON.stringify(req.body));
    if (req.body.username && req.body.pw) {
        MongoClient.connect(mongoURL, function (err, client) {
            assertion(err);
            let db = client.db('mproject');
            signup(db, req.body, function (result, msg = null) {
                client.close();
                if (result) {
                    req.session.username = req.body.username;
                    req.session.authorized = true;
                    res.redirect('/read');
                } else {
                    res.render('signup', {
                        result: msg
                    });
                }
            });
        })
    } else {
        res.render('signup', {
            result: 'Password or Username cannot be empty.'
        });
    }
});

/*-----------------------------------CRUD----------------------------------------- */
//Get all restaurant from database
app.route('/read').get(function (req, res, next) {
    console.log("Read GET");
    MongoClient.connect(mongoURL, function (err, client) {
        assertion(err);
        let db = client.db('mproject');
        //retrieving data from database
        retrieveData(db, {}, function (result, docs = 'No Record to show here!') {
            client.close();
            if (result) {
                res.render('read', {
                    username: req.session.username,
                    restaurants: docs
                });
            } else {
                res.render('read', {
                    username: req.session.username,
                    restaurants: docs
                });
            }
        });
    });
}).post(upload.none(), function (req, res, next) {
    console.log("Read POST");
    MongoClient.connect(mongoURL, {
        useNewUrlParser: true
    }, function (err, client) {
        assertion(err);
        let db = client.db('mproject');
        retrieveData(db, req.body, function (result, docs = 'No Record to show here!') {
            client.close();
            console.log("Request Body " + JSON.stringify(req.body));
            if (result) {
                console.log("Read POST " + result);
                res.send(docs);
            } else {
                console.log("Read POST " + result + "----" + docs);
                res.send(docs);
            }
        })
    })
});

//Get details from database
app.get('/details', function (req, res, next) {
    console.log("Details");
    MongoClient.connect(mongoURL, function (err, client) {
        assertion(err);
        let db = client.db('mproject');
        getDetails(db, {
            'id': ObjectId(req.query.id)
        }, function (result, docs = null) {
            client.close();
            if (result) {
                console.log(JSON.stringify(result));
                res.render('details', {
                    'result': docs[0],
                    username: req.session.username
                });
            } else {
                console.log("Nothing to show");
            }
        });
    });
});

//Create Records
app.route('/createRestaurant').get(function (req, res, next) {
    res.render('createRecord');
}).post(upload.single('photo'), function (req, res) {
    MongoClient.connect(mongoURL, function (err, client) {
        let db = client.db('mproject');
        let rData = constructDocument(req);
        console.log(JSON.stringify(rData));
        createNewRecord(db, rData, function (result) {
            res.redirect('/read');
        });
    });
});

app.route('/rate').get(function (req, res, next) {
    res.render('rate', {
        id: req.query.id,
        result: ''
    });
}).post(upload.none(), function (req, res, next) {
    MongoClient.connect(mongoURL, function (err, client) {
        assertion(err);
        let db = client.db('mproject');

        updateScore(db, {
            'id': ObjectId(req.query.id),
            'score': req.body.score,
            'username': req.session.username
        }, function (result) {
            client.close();
            if (result) {
                res.redirect('/details?id=' + req.query.id);
            } else {
                res.render('rate', {
                    id: ObjectId(req.query.id),
                    result: "You have rated once."
                });
            }
        });
    });
});

//Modify information
app.route('/edit').get(function (req, res, next) {
    if (req.session.authorized) {
        res.render('edit', {
            id: req.query.id,
            enabled: true,
            result: ''
        });
    } else {
        res.render('edit', {
            id: rq.query.id,
            enabled: false,
            result: "You have no permission to edit this page."
        });
    }
}).post(upload.single('photo'), function (req, res, next) {
    MongoClient.connect(mongoURL, function (err, client) {
        assertion(err);
        let db = client.db('mproject');
        editRecord(db, {
            id: ObjectId(req.query.id),
            data: {
                text: req.body,
                photo: (req.file) ? req.file : null
            }
        }, function (result) {
            client.close();
            if (result) {
                res.redirect('/details?id=' + req.query.id);
            } else {
                console.log("update edition failed." + result);
                res.status(200).send("update edition failed." + result);
            }
        });
    });
});

//Remove Records
app.route('/delete').get(function (req, res, next) {
    MongoClient.connect(mongoURL, function (err, client) {
        assertion(err);
        let db = client.db('mproject');
        deleteRecords(db, ObjectId(req.query.id), function (result) {
            client.close();
            if (result) {
                // res.render('details', {
                //     result: 'Successfully Deleted!'
                // });
                res.send({
                    result: 'Successfully Deleted!',
                    status: 200
                });
            } else {
                res.send({
                    result: 'Deletion Failed!',
                    status: 500
                });
            }
        });
    });
});

app.get('/map', function (req, res, next) {
    res.render('map', {
        lat: req.query.lat,
        lon: req.query.lon,
        name: req.query.name,
        id: req.query.id
    });
});

/*------------------------------- The functions---------------------------------------------*/

//The login function
function login(db, data, callback) {
    //Connect db to retrieve data
    db.collection('user').findOne({
        username: data.userid,
        password: data.pw
    }, function (err, result) {
        assertion(err);
        //Check the result
        console.log("Login Function: " + JSON.stringify(result));
        if (result != null && result.username === data.userid && result.password === data.pw) {
            callback(true, result);
        } else {
            callback(false);
        }
    });
}

//The sign up function
function signup(db, data, callback) {
    //Connect db to retrieve data
    db.collection('user').find({
        username: data.username
    }).toArray(function (err, docs) {
        assertion(err);
        console.log("Sign up function: " + JSON.stringify(docs));
        if (docs.length < 1) {
            db.collection('user').insert({
                username: data.username,
                password: data.pw
            }, function (err, result) {
                assertion(err);
                if (result.insertedCount == 1) {
                    callback(true);
                } else {
                    callback(false, "Insertion Failed!");
                }
            })
        } else {
            callback(false, "User name has existed!");
        }
    });
}

//Retrieve the data belonging to the user
function retrieveData(db, data = {}, callback) {
    console.log("Retrieve Data: " + JSON.stringify(data));
    db.collection('restaurant').find(data).project({
        'name': 1
    }).sort({
        'name': 1
    }).toArray(function (err, docs) {
        assertion(err);
        if (docs.length > 0) {
            console.log("docs length: " + JSON.stringify(docs));
            callback(true, docs);
        } else {
            callback(false);
        }
    });

}

//Get details of restaurant
function getDetails(db, data, callback) {
    console.log("Get Details: " + data.id);
    db.collection('restaurant').find({
        "_id": data.id
    }).toArray(function (err, docs) {
        assertion(err);
        if (docs.length > 0) {
            console.log(JSON.stringify(docs));
            callback(true, docs);
        } else {
            callback(false);
        }
    });
}

//Add a new restaurant record
function createNewRecord(db, data, callback, options = false) {
    console.log("Create New Record");
    db.collection('restaurant').find().project({
        'restaurant_id': 1
    }).sort({
        'restaurant_id': -1
    }).limit(1).toArray(function (err, docs) {
        assertion(err);
        if (docs.length > 0) {
            data['restaurant_id'] = (parseInt(docs[0].restaurant_id) + 1).toString();
        } else {
            data['restaurant_id'] = "0";
        }
        db.collection('restaurant').insertOne(data, function (err, result) {
            assertion(err);
            if (result.insertedCount == 1) {
                if (options) {
                    callback(true, result.insertedId);
                } else {
                    callback(true);
                }
            } else {
                callback(false);
            }
        });
    });

}

//Update the scores
function updateScore(db, data, callback) {
    db.collection('restaurant').find({
        "_id": data.id,
        "grades.user": data.username
    }, {
        "_id": 1
    }).toArray(function (err, docs) {
        assertion(err);
        console.log("Update function docs: " + JSON.stringify(docs));
        if (docs.length > 0) {
            callback(false)
            return
        }
        db.collection('restaurant').updateOne({
                "_id": data.id
            }, {
                $push: {
                    'grades': {
                        'user': data.username,
                        'score': data.score
                    }
                }
            },
            function (err, result) {
                assertion(err);
                console.log("Update result: " + result.result.ok);
                if (result.result.ok == 1) {
                    callback(true);
                } else {
                    console.log(JSON.stringify(result.lastErrorObject));
                    callback(false);
                }
            });
    });
}

//Edit Record
function editRecord(db, data, callback) {
    db.collection('restaurant').updateOne({
        '_id': data.id
    }, {
        $set: handlingEdition(data.data)
    }, function (err, result) {
        assertion(err);
        if (result.result.ok === 1) {
            callback(true);
        } else {
            callback(false);
        }
    });
}

//Delete document
function deleteRecords(db, data, callback) {
    db.collection('restaurant').deleteOne({
        _id: data
    }, function (err, result) {
        assertion(err);
        if (result.result.ok == 1) {
            callback(true);
        } else {
            callback(false);
        }
    });
}

/*-----------------------------Other Funciton-----------------------------------*/
function assertion(err) {
    assert.equal(err, null);
}

function constructDocument(req) {
    let rawData = new Object();
    console.log("Construct Document:" + JSON.stringify(req.file));

    rawData['name'] = req.body.name;
    rawData['borough'] = req.body.borough;
    rawData['cuisine'] = req.body.cuisine;
    if (req.file) {
        rawData['photo'] = req.file.buffer.toString('base64');
        rawData['mimetype'] = req.file.mimetype;
    } else {
        rawData['photo'] = null;
        rawData['mimetype'] = null;
    }
    rawData['address'] = {
        'street': req.body.street,
        'building': req.body.building,
        'zipcode': req.body.zipcode,
        coord: {
            'lat': checkFloat(req.body.lat),
            'lon': checkFloat(req.body.lon)
        }
    };
    rawData['grades'] = [];
    rawData['owner'] = req.session.username;
    return rawData;
}

function getImageFromURL(imageURL, callback) {
    let parsedURL = url.parse(imageURL, true);
    let options = {
        host: parsedURL.host,
        port: parsedURL.port,
        path: parsedURL.path,
        method: "GET",
        headers: {
            'Content-Type': 'image/*'
        }
    };
    let req = http.request(options, function (res) {
        let result = null,
            mime = undefined;
        //res.setEncoding('base64');
        res.on('data', function (chunk) {
            console.log("Image from URL: " + chunk);
            console.log("Image type: " + res.headers["content-type"]);
            result = new Buffer(chunk);
            mime = res.headers["content-type"];
        });
        res.on('end', function () {
            console.log("function is ended!");
            callback(result, mime);
        });
    });
    req.on('error', function (error) {
        console.log(error.message);
    });
    req.end();
}

function checkFloat(data) {
    let temp = parseFloat(data);
    return temp ? temp : null;
}

// function handlingData(data) {
//     if (data.length < 1) {
//         return data
//     } else if (!data[Object.keys(data)[0]]) {
//         delete data[Object.keys(data)[0]];
//         return handlingData(data)
//     } else {
//         return data[Object.keys(data)[0]] + handlingData(data)
//     }
// }

function handlingEdition(data) {
    let compoundData = new Object();
    for (const key in data.text) {
        if (!data.text[key]) {
            delete data.text[key];
            continue;
        }
        switch (key) {
            case 'lat':
                compoundData['address.coord.lat'] = data.text[key];
                break;
            case 'lon':
                compoundData['address.coord.lon'] = data.text[key];
                break;
            case 'street':
                compoundData['address.street'] = data.text[key];
                break;
            case 'building':
                compoundData['address.building'] = data.text[key];
                break;
            case 'zipcode':
                compoundData['address.zipcode'] = data.text[key];
                break;
            default:
                compoundData[key] = data.text[key];
                break;
        }
    }
    if (data.photo) {
        compoundData['photo'] = new Buffer(data.photo.buffer).toString('base64');
        compoundData['mimetype'] = data.photo.mimetype;
    }
    console.log("handling data: " + JSON.stringify(compoundData));
    return compoundData;
}

app.listen(process.env.PORT || 8099);