const { randomUUID, randomBytes } = require('crypto')

const FIRST_NAMES = ['Alex', 'Jordan', 'Taylor', 'Sam', 'Casey', 'Riley', 'Morgan', 'Jamie', 'Drew', 'Avery', 'Quinn', 'Reese']
const LAST_NAMES = ['Smith', 'Johnson', 'Lee', 'Brown', 'Garcia', 'Martinez', 'Davis', 'Clark', 'Walker', 'Young']
const WORDS = ['lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit', 'sed', 'tempor', 'magna', 'aliqua']

const pick = list => list[Math.floor(Math.random() * list.length)]
const randomFirstName = () => pick(FIRST_NAMES)
const randomLastName = () => pick(LAST_NAMES)

// Every function here is called fresh on every {{% tagName %}} occurrence, in every
// field (URL, headers, body) of every request — so values differ per use, same as
// Postman's built-in dynamic variables ({{$guid}}, {{$randomInt}}, etc.).
module.exports = {
    templateTags: {
        uuid: () => randomUUID(),
        guid: () => randomUUID(),
        timestamp: () => String(Math.floor(Date.now() / 1000)),
        isoTimestamp: () => new Date().toISOString(),
        randomInt: () => String(Math.floor(Math.random() * 1001)),
        randomFloat: () => (Math.random() * 100).toFixed(2),
        randomBoolean: () => String(Math.random() < 0.5),
        randomHex8: () => randomBytes(4).toString('hex'),
        randomWord: () => pick(WORDS),
        randomFirstName,
        randomLastName,
        randomFullName: () => `${randomFirstName()} ${randomLastName()}`,
        randomEmail: () => `${randomFirstName()}.${randomLastName()}${Math.floor(Math.random() * 100)}@example.com`.toLowerCase(),
        randomIp: () => Array.from({ length: 4 }, () => 1 + Math.floor(Math.random() * 254)).join('.'),
    },
}
