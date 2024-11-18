package internal

import (
	"context"
	"encoding/json"
	"slices"
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
	subs []chan json.RawMessage
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

	for _, sub := range b.subs {
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
	b.subs = append(b.subs, ch)

	go func() {
		<-ctx.Done()
		b.lockAndRemoveSubWhere(ch)
	}()

	return curr, ch
}

func (b *provider) lockAndRemoveSubWhere(ch chan json.RawMessage) {
	b.mu.Lock()
	defer b.mu.Unlock()

	idx := slices.Index(b.subs, ch)
	if idx == -1 {
		return
	}
	b.subs[idx] = b.subs[len(b.subs)-1]
	b.subs = b.subs[:len(b.subs)-1]
}
