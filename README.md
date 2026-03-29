# Nanook
## Server (Whitelist API)
Requires a `.env` file with the following fields
```
DB_PATH=/path/to/whitelist.db
RCON_ADDR=ip.addr.of.server
RCON_PASS=P4ssw0rd # Set by the mc server
API_TOKEN=T0k3n # Used by the discord bot to communicate
```

Start the server with `go run main.go`

## Client (Discord bot)
Requires a `.env` file with the following fields
```
BOT_TOKEN=Discord Developer token
NANOOK_BASE_URL=Ip address to server (localhost:8000)
NANOOK_TOKEN=API_TOKEN defined in Server
```

Start the bot with `npm install && npm run dev`
