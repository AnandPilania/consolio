const { randomUUID, randomBytes } = require("node:crypto")

const FIRST_NAMES = [
    "Alex",
    "Jordan",
    "Taylor",
    "Sam",
    "Casey",
    "Riley",
    "Morgan",
    "Jamie",
    "Drew",
    "Avery",
    "Quinn",
    "Reese",
]
const LAST_NAMES = [
    "Smith",
    "Johnson",
    "Lee",
    "Brown",
    "Garcia",
    "Martinez",
    "Davis",
    "Clark",
    "Walker",
    "Young",
]
const WORDS = [
    "lorem",
    "ipsum",
    "dolor",
    "sit",
    "amet",
    "consectetur",
    "adipiscing",
    "elit",
    "sed",
    "tempor",
    "magna",
    "aliqua",
]

const pick = (list) => list[Math.floor(Math.random() * list.length)]
const randomFirstName = () => pick(FIRST_NAMES)
const randomLastName = () => pick(LAST_NAMES)
const randomSlug = () =>
    `${pick(WORDS)}-${pick(WORDS)}-${Math.floor(Math.random() * 10000)}`
const randomPhone = () =>
    `+1${Math.floor(2000000000 + Math.random() * 7000000000)}`
const randomDate = () =>
    new Date(Date.now() - Math.floor(Math.random() * 31536000000))
        .toISOString()
        .slice(0, 10)

module.exports = {
    templateTags: {
        uuid: () => randomUUID(),
        guid: () => randomUUID(),
        timestamp: () => String(Math.floor(Date.now() / 1000)),
        isoTimestamp: () => new Date().toISOString(),
        randomInt: () => String(Math.floor(Math.random() * 1001)),
        randomFloat: () => (Math.random() * 100).toFixed(2),
        randomBoolean: () => String(Math.random() < 0.5),
        randomHex8: () => randomBytes(4).toString("hex"),
        randomWord: () => pick(WORDS),
        randomFirstName,
        randomLastName,
        randomFullName: () => `${randomFirstName()} ${randomLastName()}`,
        randomEmail: () =>
            `${randomFirstName()}.${randomLastName()}${Math.floor(Math.random() * 100)}@example.com`.toLowerCase(),
        randomIp: () =>
            Array.from({ length: 4 }, () => 1 + Math.floor(Math.random() * 254)).join(
                ".",
            ),
        randomSlug,
        randomPhone,
        randomDate,
        randomUrl: () => `https://${randomSlug()}.example.com`,
    },
    paneTabs: {
        request: [
            {
                id: "generators",
                label: "Generators",
                render: () => ({
                    kind: "table",
                    rows: [
                        {
                            label: "Identity",
                            value: "{{% uuid %}}, {{% guid %}}",
                        },
                        {
                            label: "Time",
                            value: "{{% timestamp %}}, {{% isoTimestamp %}}",
                        },
                        {
                            label: "Numbers",
                            value:
                                "{{% randomInt %}}, {{% randomFloat %}}, {{% randomBoolean %}}",
                        },
                        {
                            label: "People",
                            value:
                                "{{% randomFirstName %}}, {{% randomLastName %}}, {{% randomEmail %}}",
                        },
                        {
                            label: "Network",
                            value: "{{% randomHex8 %}}, {{% randomIp %}}",
                        },
                    ],
                }),
            },
        ],
    },
}
