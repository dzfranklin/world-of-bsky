package internal

import (
	"context"
	"encoding/json"
	"sync"
)

const size = 1024

type provider struct {
	mu sync.Mutex

	// ring buffer
	buf   []json.RawMessage
	write int
	count int

	// subscribers
	subs map[chan json.RawMessage]struct{}
}

var Provider = &provider{
	buf: make([]json.RawMessage, size),
}

func (b *provider) Push(val json.RawMessage) {
	b.mu.Lock()
	defer b.mu.Unlock()

	// ring buffer

	b.buf[b.write] = val
	b.write = (b.write + 1) % size

	if b.count < size {
		b.count++
	}

	// subscribers

	for sub := range b.subs {
		select {
		case sub <- val:
		default:
		}
	}
}

func (b *provider) Len() int {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.count
}

func (b *provider) SubscribeAndGet(ctx context.Context) ([]json.RawMessage, chan json.RawMessage) {
	b.mu.Lock()
	defer b.mu.Unlock()

	curr := make([]json.RawMessage, 0, b.count)
	for i := 0; i < b.count; i++ {
		index := (b.write + size - b.count + i) % size
		curr = append(curr, b.buf[index])
	}

	ch := make(chan json.RawMessage, 1)
	b.subs[ch] = struct{}{}

	go func() {
		<-ctx.Done()
		b.mu.Lock()
		defer b.mu.Unlock()
		delete(b.subs, ch)
	}()

	return curr, ch
}
