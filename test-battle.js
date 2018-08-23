const Engine = require('ai-battle-engine')
const opts = require('commander')
const helpers = require('./helpers')

opts
	.description('CLI to test the hero.js code locally')
	.option('-w, --wait <n>', 'Turn by turn step through of the battle', parseFloat, 1500)
	.option('-t, --turns <n>', 'Specifies how many turns to run', parseFloat, 1250)
	.option('-H, --only-hero', 'Show only hero turns')
	.option('-h, --heroes <b>', 'Heroes per team', parseFloat, 12)
	.option('-d, --deathmatch', 'Use a deathmatch map')
	.parse(process.argv)

const engine = new Engine({ maxUsersPerTeam: opts.heroes, maxTurns: opts.turns })
const users = '.'.repeat(opts.heroes * 2).split('').map((_, i) => ({ github_login: i }))
const game = engine.planAllGames(users).games[0]
const { heroes } = game

function carefulAssasin() {
	if (game.activeHero.health < 50) {
		return helpers.findNearestHealthWell(game)
	}
	return helpers.findNearestWeakerEnemy(game)	|| helpers.findNearestEnemy(game)
}

function safeMiner() {
	const well = helpers.findNearestHealthWell(game)
	if (well && game.activeHero.health < 40) {
		return well
	}
	return helpers.findNearestNonTeamDiamondMine(game) || carefulAssasin()
}

const myHero = heroes[Math.floor(Math.random() * heroes.length)]

heroes.forEach((hero) => {
	hero.getCode = function () {
		return this.name[0] + Math.min(this.health, 99)
	}
	if (hero === myHero) {
		hero.name = 'Hero'
		hero.move = require('./hero.js')
	} else {
		hero.name = hero.team === myHero.team ? 'Ally' : 'Enemy'
		hero.move = Math.random() < 0.5 ? safeMiner : carefulAssasin
	}
})

step()

function step() {
	const hero = game.activeHero
	const direction = hero.move(game, helpers)
	game.handleHeroTurn(direction)
	if (game.turn === 1 || hero === myHero || !opts.onlyHero || game.ended) {
		console.log('<<<<<<<<<<< >>>>>>>>>>>>>>>>')
		console.log('Turn ' + game.turn + ':')
		console.log(hero.name, 'tried to move', direction)
		console.log(hero.name, 'has', hero.health, 'health')
		console.log(hero.name, 'killed', hero.heroesKilled.length, 'enemies')
		console.log(hero.name, 'robbed', hero.gravesRobbed, 'graves')
		console.log(hero.name, 'has', hero.diamondsEarned, 'diamonds')
		console.log(hero.name, 'has', hero.mineCount, 'mines')
		console.log(hero.name, 'healed', hero.healthGiven, 'hp')
		game.board.inspect()
	}

	if (game.ended) {
		if (myHero.dead) {
			console.log('->', myHero.name, 'was DEAD by the end')
		}
		if (myHero.won) {
			console.log('->', myHero.name, 'WON!')
		} else {
			console.log('->', myHero.name, 'LOST!')
		}
		process.exit()
	}

	const timeout = Math.ceil(opts.wait / (hero === myHero ? 1 : 10))
	setTimeout(step, timeout)
}
