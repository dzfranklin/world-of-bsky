package main

import (
	"context"
	"encoding/json"
	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
	"github.com/dzfranklin/world-of-bsky/api/internal"
	"log"
	"log/slog"
	"net/http"
	"time"
)

func main() {
	addr := ":8100"
	ingestEndpoint := "ws://localhost:8000"

	go func() {
		for {
			err := subscribeToIngest(ingestEndpoint)
			if err != nil {
				slog.Error("subscribeToIngest failed", "error", err)
			} else {
				slog.Error("subscribeToIngest exited prematurely", "error", err)
			}
			time.Sleep(1 * time.Second)
		}
	}()

	http.HandleFunc("/feed", func(w http.ResponseWriter, r *http.Request) {
		c, acceptErr := websocket.Accept(w, r, &websocket.AcceptOptions{InsecureSkipVerify: true})
		if acceptErr != nil {
			writeError(w, http.StatusBadRequest, "failed to accept websocket")
			return
		}
		defer c.CloseNow()

		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()

		c.CloseRead(ctx)

		initial, updates := internal.Provider.SubscribeAndGet(ctx)

		for _, img := range initial {
			if err := wsjson.Write(ctx, c, img); err != nil {
				return
			}
		}

		for update := range updates {
			if err := wsjson.Write(ctx, c, update); err != nil {
				return
			}
		}
	})

	slog.Info("listening on " + addr)
	if err := http.ListenAndServe(addr, nil); err != nil {
		log.Fatal(err)
	}
}

func subscribeToIngest(ingestEndpoint string) error {
	ctx := context.Background()

	c, _, dialErr := websocket.Dial(ctx, ingestEndpoint, nil)
	if dialErr != nil {
		return dialErr
	}
	defer c.CloseNow()
	slog.Info("dialed ingest", "endpoint", ingestEndpoint)

	for {
		var msg json.RawMessage
		if err := wsjson.Read(ctx, c, &msg); err != nil {
			return err
		}
		internal.Provider.Push(msg)
	}
}

func writeError(w http.ResponseWriter, code int, err string) {
	w.WriteHeader(code)
	_, _ = w.Write([]byte(err))
	_, _ = w.Write([]byte("\n"))
	return
}
