package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/Tnze/go-mc/net"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	_ "github.com/mattn/go-sqlite3"
)

type whitelist struct {
	Name    string    `db:"name"    json:"name"`
	UUID    string    `db:"id"      json:"id"`
	Created time.Time `db:"created" json:"created"`
}

type minecraftProfile struct {
	Name string `json:"name"`
	UUID string `json:"id"`
}

type whitelistRequest struct {
	Name string `json:"name"`
}

type app struct {
	DB       *sql.DB
	RconAddr string
	RconPass string
	APIToken string
}

func (db *app) getWhitelist(context *gin.Context) {
	rows, _ := db.DB.Query(
		`SELECT id, name, created FROM whitelist ORDER BY created`,
	)

	var wl []whitelist
	for rows.Next() {
		var w whitelist
		rows.Scan(&w.UUID, &w.Name, &w.Created)
		wl = append(wl, w)
	}

	context.IndentedJSON(http.StatusOK, wl)
}

func (db *app) postWhitelist(context *gin.Context) {
	var newUser whitelistRequest
	var profile minecraftProfile
	var newWhitelist whitelist

	if err := context.BindJSON(&newUser); err != nil {
		return
	}

	profile, err := getMojangUser(newUser.Name)

	if err != nil {
		// TODO: Rework for better status return
		context.IndentedJSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	var exists bool
	db.DB.QueryRow(
		`SELECT EXISTS(SELECT 1 FROM whitelist WHERE id = ?)`,
		profile.UUID,
	).Scan(&exists)

	if exists {
		context.IndentedJSON(http.StatusConflict, gin.H{"error": "user already whitelisted"})
		return
	}

	newWhitelist.Name = profile.Name
	newWhitelist.UUID = profile.UUID
	newWhitelist.Created = time.Now()

	db.DB.Exec(
		`INSERT INTO whitelist (id, name, created) VALUES (?, ?, ?)`,
		newWhitelist.UUID, newWhitelist.Name, newWhitelist.Created,
	)

	if err := db.sendRconWhitelist("whitelist add " + newWhitelist.Name); err != nil {
		log.Printf("rcon whitelist add failed: %v", err)
	}

	context.IndentedJSON(http.StatusCreated, newWhitelist)
}

func (db *app) deleteWhitelist(context *gin.Context) {
	name := context.Param("name")

	res, _ := db.DB.Exec(
		`DELETE FROM whitelist WHERE name = ?`,
		name,
	)

	rows, _ := res.RowsAffected()
	if rows == 0 {
		context.JSON(http.StatusNotFound, gin.H{"error": "user not in whitelist"})
		return
	}

	if err := db.sendRconWhitelist("whitelist remove " + name); err != nil {
		log.Printf("rcon whitelist remove failed: %v", err)
	}

	context.Status(http.StatusNoContent)
}

func (db *app) sendRconWhitelist(cmd string) error {
	conn, err := net.DialRCON(db.RconAddr, db.RconPass)
	if err != nil {
		return fmt.Errorf("rcon dial failed: %w", err)
	}
	defer conn.Close()

	err = conn.Cmd(cmd)
	if err != nil {
		return fmt.Errorf("rcon cmd failed: %w", err)
	}

	return nil
}

func getMojangUser(name string) (minecraftProfile, error) {
	var profile minecraftProfile

	res, err := http.Get("https://api.mojang.com/users/profiles/minecraft/" + name)
	if err != nil {
		return profile, fmt.Errorf("request to mojang api failed: %w", err)
	}
	defer res.Body.Close()

	if res.StatusCode == http.StatusNotFound {
		return profile, fmt.Errorf("invalid user %q", name)
	}

	if res.StatusCode != http.StatusOK {
		return profile, fmt.Errorf("unexpected response: %s", res.Status)
	}

	if err := json.NewDecoder(res.Body).Decode(&profile); err != nil {
		return profile, fmt.Errorf("invalid json: %w", err)
	}

	return profile, nil
}

func createDB(db *sql.DB) {
	_, err := db.Exec(`
			CREATE TABLE IF NOT EXISTS whitelist (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				created DATETIME NOT NULL
			);
		`)

	if err != nil {
		log.Fatal(err)
	}
}

func authMiddleware(apiToken string) gin.HandlerFunc {
	return func(context *gin.Context) {
		auth := context.GetHeader("Authorization")
		const prefix = "Bearer "

		if len(auth) <= len(prefix) || auth[:len(prefix)] != prefix {
			context.AbortWithStatusJSON(
				http.StatusUnauthorized,
				gin.H{"error": "missing or invalid auth"},
			)
			return
		}

		token := auth[len(prefix):]
		if token != apiToken {
			context.AbortWithStatusJSON(
				http.StatusForbidden,
				gin.H{"error": "forbidden"},
			)
			return
		}

		context.Next()
	}
}

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("warning: could not find a .env file")
	}

	dbPath := os.Getenv("DB_PATH")

	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		log.Fatal(err)
	}

	createDB(db)

	s := &app{
		DB:       db,
		RconAddr: os.Getenv("RCON_ADDR"),
		RconPass: os.Getenv("RCON_PASS"),
	}
	router := gin.Default()
	router.Use(authMiddleware(os.Getenv("API_TOKEN")))
	router.GET("/whitelist", s.getWhitelist)
	router.POST("/whitelist", s.postWhitelist)
	router.DELETE("/whitelist/:name", s.deleteWhitelist)

	router.Run("localhost:8000")
}
