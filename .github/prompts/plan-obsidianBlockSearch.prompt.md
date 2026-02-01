## Plan: Add 'tag:' search operator with autocomplete

Extend the block search plugin to support the 'tag:' operator, filtering results to blocks in files containing the specified tag, and provide autocomplete suggestions for vault tags when typing 'tag:#'. Leverage Obsidian's metadata cache for tag retrieval and FuzzySuggestModal for suggestions.

### Steps
1. Update [src/ui/searchModal.ts](src/ui/searchModal.ts) to detect 'tag:#' input prefix and display tag suggestions from `app.metadataCache.getTags()`.
2. Modify [src/blocks/searcher.ts](src/blocks/searcher.ts) to parse 'tag:#tag' from query, filter blocks to files with the tag via `getFileCache(file)?.frontmatter?.tags`.
3. Adjust query highlighting in [src/ui/searchModal.ts](src/ui/searchModal.ts) to strip operators before searching block text.
4. Add optional settings toggle in [src/settings.ts](src/settings.ts) for enabling operator support.

### Further Considerations
1. Support multiple operators (e.g., 'tag:#work file:notes')? Implement basic single-operator parsing first.
2. Optimize for large vaults by caching tag data or listening to 'resolved' events for updates.
3. Validate tag existence and handle nested tags like '#work/project' matching '#work'.
