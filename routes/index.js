var express = require('express');
var request = require('request');
var rssReader = require('feed-read')
var mongoose = require('mongoose');
var router = express.Router();
var User = require('../model/user');

mongoose.Promise = global.Promise;
mongoose.connect('localhost','test');
/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

router.get('/webhook', function(req, res) {
  if (req.query['hub.mode'] === 'subscribe' &&
      req.query['hub.verify_token'] === 'random_token') {
    console.log("Validating webhook");
    res.status(200).send(req.query['hub.challenge']);
  } else {
    console.error("Failed validation. Make sure the validation tokens match.");
    res.sendStatus(403);          
  }  
});

router.post('/webhook', function (req, res) {
  var data = req.body;

  // Make sure this is a page subscription
  if (data.object === 'page') {
  	//console.log("blah blah")
    // Iterate over each entry - there may be multiple if batched
    data.entry.forEach(function(entry) {
      var pageID = entry.id;
      var timeOfEvent = entry.time;
      //receivedMessage(event);
      // Iterate over each messaging event
      entry.messaging.forEach(function(event) {
        if (event.message) {
          var senderID = event.sender.id;
          var recipientID = event.recipient.id;
          var timeOfMessage = event.timestamp;
          text = event.message.text;
          var normalizedText = text.toLowerCase().replace(' ','')
          getArticles(function(err, articles) {
            if (err){
              console.log(err);
            } else {
                switch(normalizedText) {
                    case "showmore":
                      var maxArticles = Math.min(articles.length, 5)
                      for (var i = 0 ; i < maxArticles; i ++) {
                        sendGenericMessage(senderID, articles[i]);
                      }
                      break;
                    case "/subscribe":
                      subscribeUser(senderID)
                      break;
                    default:
                      sendGenericMessage(senderID, articles[0])
                      break;
                }
              }
          })   
        } else {
          console.log("Webhook received unknown event: ", event);
        }
      });
    });

    // Assume all went well.
    //
    // You must send back a 200, within 20 seconds, to let us know
    // you've successfully received the callback. Otherwise, the request
    // will time out and we will keep trying to resend.
    res.sendStatus(200);
  }
});

function subscribeUser(id){
  var newUser = new User({
    fb_id: id,
  });

  User.save(function(err){
    if (err) {
      sendTextMessage(id, "there was an error")
    } else {
      console.log('User saved successfully')
      sendTextMessage(newUser.fb_id, "You've been subsribed")
    }  
  })
}
var token = process.env.TOKEN_VALUE
var googleNewsEndpoint = "https://news.google.com/news?output=rss"
function getArticles(callback) {
  rssReader(googleNewsEndpoint, function(err, articles) {
    if (err) {
      callback(err)
    } else {
      if (articles.length >0) {
        callback(null, articles)
      } else{
        callback("no articles received")
      }
    }
  })
}

function sendTextMessage(recipientId, messageText) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: messageText
    }
  };

  callSendAPI(messageData);
}
function callSendAPI(messageData) {
  request({
    uri: 'https://graph.facebook.com/v2.6/me/messages',
    qs: { access_token: process.env.TOKEN_VALUE },
    method: 'POST',
    json: messageData

  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var recipientId = body.recipient_id;
      var messageId = body.message_id;

      console.log("Successfully sent generic message with id %s to recipient %s", 
        messageId, recipientId);
    } else {
      console.error("Unable to send message.");
      console.error(response);
      console.error(error);
    }
  });  
}

function receivedMessage(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfMessage = event.timestamp;
  var message = event.message;

  console.log("Received message for user %d and page %d at %d with message:", 
    senderID, recipientID, timeOfMessage);
  console.log(JSON.stringify(message));

  var messageId = message.mid;

  var messageText = message.text;
  var messageAttachments = message.attachments;
  //sendTextMessage(senderID, messageText);
  if (messageText) {
  	//sendTextMessage(senderID, messageText);
    // If we receive a text message, check to see if it matches a keyword
    // and send back the example. Otherwise, just echo the text we received.
    switch (messageText) {
      case 'generic':
        sendGenericMessage(senderID);
        break;

      default:

      	//getArticles(function(err, articles) {
      	//	sendTextMessage(senderID, articles)
      	//})
        sendTextMessage(senderID, messageText);
    }
  } else if (messageAttachments) {
    sendTextMessage(senderID, "Message with attachment received");
  }
}
function sendGenericMessage(recipientId, article) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "generic",
          elements: [{
            title: article.title,
            subtitle: article.published.toString(),
            item_url: article.link
            }]
        }
      }
    }
  };

  callSendAPI(messageData);
}

module.exports = router;
