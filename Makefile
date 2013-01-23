build:
	./node_modules/.bin/browserify-server \
		--bundle=index.js -o ./browserify-combined.js

server:
	./node_modules/.bin/browserify-server \
		--server=./ --port=9476

watch:
	./node_modules/.bin/wr "make build" .

live-reload:
	./node_modules/.bin/live-reload --port=9474

prototype:
	make build
	make server &
	make live-reload &
	make watch
