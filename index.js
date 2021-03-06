const openid  = require('openid');
const axios = require('axios');

var relyingParty, apiKey, useSession = true;

function middleware(opts) {
	relyingParty = new openid.RelyingParty(
		opts.verify,
		opts.realm,
		true,
		true,
		[]
	);

	apiKey = opts.apiKey;
	useSession = true;
	if(opts.useSession !== undefined) {
		useSession = opts.useSession;
	}

	return function(req, res, next) {
		next();
	};
}

function enforceLogin(redirect) {
	return function(req, res, next) {
		if(!req.session.steamUser)
			return res.redirect(redirect);
		next();
	};
}

function verify() {
	return function(req, res, next) {
		relyingParty.verifyAssertion(req, function(err, result) {
			if(err) 
				return next(err.message);
			if(!result || !result.authenticated) 
				return next('Failed to authenticate user.');
			if(!/^https?:\/\/steamcommunity\.com\/openid\/id\/\d+$/.test(result.claimedIdentifier))
				return next('Claimed identity is not valid.');
			fetchIdentifier(result.claimedIdentifier)
				.then(function(user) {
					if(useSession) {
						req.session.steamUser = user;
					}
					next();
				})
				.catch(function(err) {
					next(err);
				});
		});
	};
}

function authenticate() {
	return function(req, res, next) {
		relyingParty.authenticate('https://steamcommunity.com/openid', false, function(err, authURL) {
			if(err) {
				console.log(err);
				return next('Authentication failed: ' + err);

			}
			if(!authURL)
				return next('Authentication failed.');
			res.redirect(authURL);
		});
	};
}

function fetchIdentifier(openid) {
	// our url is http://steamcommunity.com/openid/id/<steamid>
	steamID = openid.replace('https://steamcommunity.com/openid/id/', '');
	return axios.get(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${apiKey}&steamids=${steamID}`)
		.then(({data}) => {
			let players = data.response.players;
			if(players.length == 0)
				throw new Error('No players found for the given steam ID.');
			let player = players[0];
			return ({
				_json: player,
				openid,
				steamid: steamID,
				username: player.personaname,
				name: player.realname,
				profile: player.profileurl,
				avatar: {
					small: player.avatar,
					medium: player.avatarmedium,
					large: player.avatarfull
				}
			});
		});
}

function logout(req) {
	return function() {
		delete req.session.steamUser;
	}
}

module.exports = { authenticate, verify, enforceLogin, middleware, logout };
