# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

build:
	./node_modules/.bin/browserify-server \
		--bundle=index.js -o ./browserify-combined.js

server:
	./node_modules/.bin/browserify-server \
		--server=./ --port=9476

prototype:
	make build
	make server
