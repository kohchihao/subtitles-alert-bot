var TelegramBot = require('node-telegram-bot-api');
var Addic7ed = require('./libs/addic7ed.js');
var BotGui = require('./gui/keyboards.js');
var Common = require('./common.js');
var Translate = require('./translations.js');
var TvMaze = require('./libs/tvMaze.js');
var telegramBotToken = '398340624:AAH3rtCzaX9Y2fDU0ssRrK4vhRVh1PpZA0w';
var Session = require('./models/session.js');
var Mongo = require('./db/mongo.js');
var Core = require('./core.js');
var Model = require('./models/languages.js');

exports.handleGetLogic = function (userInput, session, sessions, msg, match, bot) {
    if (Common.notACommand(userInput) && session.choosingSeries) {
        let promise = TvMaze.checkSeriesValidity(userInput);
        promise.then(function (response) {
            switch (response.length) {
                case 0:
                    bot.sendMessage(msg.chat.id, Translate.failedSeriesMessage[session.userLanguage]);
                    Common.pushInSessions(sessions, session);
                    break;
                case 1:
                    bot.sendMessage(msg.chat.id, Translate.whichSeasonMessage[session.userLanguage](response[0].show.name));
                    Common.handleChosenSeries(response[0], session, sessions);
                    break;
                default:
                    session.ambiguousSeries = response;
                    bot.sendMessage(msg.chat.id, Translate.ambiguousSeriesMessage[session.userLanguage],
                        BotGui.generateSeriesInlineKeyboard(response));
                    break;
            }
        });
    }

    else if (Common.notACommand(userInput) && session.choosingSeason) {
        if (!Common.isValidNumber(userInput)) {
            bot.sendMessage(msg.chat.id, Translate.notANumberMessage[session.userLanguage]);
            return;
        }
        else {
            let promise = TvMaze.checkSeasonValidity(session.choosenSeries.show.id, userInput);
            promise.then(function (response) {
                if (response === false)
                    bot.sendMessage(msg.chat.id, Translate.seasonNotFoundMessage[session.userLanguage]);
                else {
                    session.choosenSeason = userInput;
                    Common.resetValues(session);
                    session.choosingEpisode = true;
                    Common.pushInSessions(sessions, session);
                    bot.sendMessage(msg.chat.id, Translate.whichEpisodeMessage[session.userLanguage]);
                }
            });
        }
    }
    else if (Common.notACommand(userInput) && session.choosingEpisode) {
        if (!Common.isValidNumber(userInput) && !Common.isValidInterval(userInput)) {
            bot.sendMessage(msg.chat.id, Translate.notANumberMessage[session.userLanguage]);
            return;
        }
        else {
            let promise = TvMaze.checkEpisodeValidity(session.choosenSeries.show.id, session.choosenSeason, userInput);
            if(promise == "wrongInterval"){
                bot.sendMessage(msg.chat.id, Translate.notValidIntervalGetMessage[session.userLanguage]);
                return;
            }
            promise.then(function (response) {
                if (response !== true)
                    bot.sendMessage(msg.chat.id, Translate.episodeNotFoundMessage[session.userLanguage]);
                else {
                    session.choosenEpisode = userInput;
                    Common.resetValues(session);
                    session.choosingLanguage = true;
                    Common.pushInSessions(sessions, session);
                    bot.sendMessage(msg.chat.id, Translate.whichLanguageMessage[session.userLanguage]);
                }
            });
        }
    }
    else if (Common.notACommand(userInput) && session.choosingLanguage) {
        // accepted "native" version, "int" version and 3 chars version (e.g. "italiano", "italian" or "ita")
        var languageKey = Object.keys(Model.languages).find(function (key) {
            return key.length == 3 && (key.toUpperCase() === userInput.toUpperCase() ||
                Model.languages[key]["native"][0].toUpperCase() === userInput.toUpperCase() ||
                Model.languages[key]["int"][0].toUpperCase() === userInput.toUpperCase())
        })

        if (languageKey) {
            session.chosenLanguage = languageKey;
            bot.sendMessage(msg.chat.id, Translate.LoadingSubtitleMessage[session.userLanguage]);
            Addic7ed.addic7edGetSubtitle(session, session.chosenLanguage, bot, msg.chat.id, sessions);
        }
        else
            bot.sendMessage(msg.chat.id, Translate.languageNotFoundMessage[session.userLanguage]);
    }
}

exports.handleStartAlertLogic = function (userInput, session, sessions, msg, match, bot) {
    if (Common.notACommand(userInput) && session.choosingSeriesAlert) {
        let promise = TvMaze.checkSeriesValidity(userInput);
        promise.then(function (response) {
            switch (response.length) {
                case 0:
                    bot.sendMessage(msg.chat.id, Translate.failedSeriesMessage[session.userLanguage]);
                    Common.pushInSessions(sessions, session);
                    break;
                case 1:
                    if (response[0].show.status !== Translate.runningState) {
                        bot.sendMessage(msg.chat.id, Translate.seriesNotRunningMessage[session.userLanguage](response[0].show.name));
                    } else {
                        bot.sendMessage(msg.chat.id, Translate.whichLanguagesAlertMessage[session.userLanguage](response[0].show.name));
                        Common.resetValues(session);
                        session.choosingLanguageAlert = true;
                        session.choosenSeriesAlert = response[0];
                        Common.pushInSessions(sessions, session);
                    }
                    break;
                default:
                    session.ambiguousSeriesAlert = response;
                    bot.sendMessage(msg.chat.id, Translate.ambiguousSeriesMessage[session.userLanguage],
                        BotGui.generateSeriesInlineKeyboard(response));
                    break;
            }
        });
    }
    if (Common.notACommand(userInput) && session.choosingLanguageAlert && userInput.toLowerCase() != Translate.okDonelanguageCommand) {
        var languageKey = Object.keys(Model.languages).find(function (key) {
            return key.length == 3 && (key.toUpperCase() === userInput.toUpperCase() ||
                Model.languages[key]["native"][0].toUpperCase() === userInput.toUpperCase() ||
                Model.languages[key]["int"][0].toUpperCase() === userInput.toUpperCase())
        })

        if (languageKey) {
            if (!Common.languageAlreadyPresent(session.chosenLanguagesAlert, languageKey)) {
                Common.getLanguageFromKey(languageKey);
                session.chosenLanguagesAlert.push(languageKey);
                bot.sendMessage(msg.chat.id, Translate.addLanguageMessage[session.userLanguage]);
            } else {
                bot.sendMessage(msg.chat.id, Translate.languageAlreadyPresentMessage[session.userLanguage]);
            }
        }
        else
            bot.sendMessage(msg.chat.id, Translate.languageNotFoundMessage);
    }
}

exports.handleDeleteLogic = function (msg, userInput, session, sessions, bot) {
    if (userInput == Translate.revertCallback[session.userLanguage])
        bot.sendMessage(msg.from.id, Translate.revertDeleteMessage[session.userLanguage], BotGui.generateKeyboardOptions(session.userLanguage));
    else
        Mongo.deleteAlertFromSingleUser(msg.from.id, session.alertToDelete, session.chatId, bot, session);

    Common.resetValues(session);
    Common.pushInSessions(sessions, session);
}

exports.handleLanguageConfirmation = function (userInput, session, msg, bot){
    if (Common.notACommand(userInput) && session.choosingLanguageAlert && userInput.toLowerCase() == Translate.okDonelanguageCommand) {
        if (session.chosenLanguagesAlert.length == 0) {
            bot.sendMessage(msg.from.id, Translate.chooseAtLeastALanguageMessage[session.userLanguage]);
        } else {
            session.choosingLanguageAlert = false;
            Mongo.subscribe(session, bot, msg.from);
        }
    }
}

exports.handleDonateLogic = function(userInput, session, sessions, msg, match, bot){
    //TODO
}
