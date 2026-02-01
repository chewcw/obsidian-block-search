install: build
		@echo "Installing the application..."
		cp main.js manifest.json styles.css /home/ccw/Documents/obsidian/obsidian/.obsidian/plugins/obsidian-block-search
build:
		 npm run build