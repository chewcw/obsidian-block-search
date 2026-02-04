import { Block, FileContext } from "../types";
import { OperatorTerm, PropertyTerm, QueryNode, QueryTerm, TextTerm } from "./queryTypes";

export interface GroupContext {
	blocks: Block[];
	root: Block;
	groupText: string;
}

export interface EvalContext {
	file: FileContext;
	group: GroupContext;
	caseSensitive: boolean;
}

export interface EvalResult {
	matched: boolean;
	score: number;
}

export function evaluateQuery(node: QueryNode, ctx: EvalContext, caseOverride?: boolean): EvalResult {
	switch (node.type) {
		case "and": {
			let total = 0;
			for (const term of node.terms) {
				const result = evaluateQuery(term, ctx, caseOverride);
				if (!result.matched) return { matched: false, score: 0 };
				total += result.score;
			}
			return { matched: true, score: total };
		}
		case "or": {
			let best: EvalResult = { matched: false, score: 0 };
			for (const term of node.terms) {
				const result = evaluateQuery(term, ctx, caseOverride);
				if (result.matched && result.score > best.score) best = result;
			}
			return best;
		}
		case "not": {
			const result = evaluateQuery(node.term, ctx, caseOverride);
			return result.matched ? { matched: false, score: 0 } : { matched: true, score: 0 };
		}
		case "term":
			return evaluateTerm(node.term, ctx, caseOverride);
		default:
			return { matched: false, score: 0 };
	}
}

function evaluateTerm(term: QueryTerm, ctx: EvalContext, caseOverride?: boolean): EvalResult {
	switch (term.kind) {
		case "text":
			return matchTextTerm(term, ctx.group.groupText, caseOverride ?? ctx.caseSensitive);
		case "operator":
			return evaluateOperatorTerm(term, ctx, caseOverride);
		case "property":
			return evaluatePropertyTerm(term, ctx, caseOverride);
		default:
			return { matched: false, score: 0 };
	}
}

function evaluateOperatorTerm(term: OperatorTerm, ctx: EvalContext, caseOverride?: boolean): EvalResult {
	switch (term.operator) {
		case "file":
			return evaluateTextQueryOnText(term.operand, ctx.file.fileName, caseOverride ?? ctx.caseSensitive);
		case "path":
			return evaluateTextQueryOnText(term.operand, ctx.file.filePath, caseOverride ?? ctx.caseSensitive);
		case "content":
			return evaluateTextQueryOnText(term.operand, ctx.file.content, caseOverride ?? ctx.caseSensitive);
		case "match-case":
			return evaluateQuery(term.operand, ctx, true);
		case "ignore-case":
			return evaluateQuery(term.operand, ctx, false);
		case "tag":
			return evaluateTag(term.operand, ctx, caseOverride);
		case "line":
			return evaluateLine(term.operand, ctx, caseOverride);
		case "block":
			return evaluateBlock(term.operand, ctx, caseOverride);
		case "section":
			return evaluateSection(term.operand, ctx, caseOverride);
		case "task":
			return evaluateTask(term.operand, ctx, caseOverride, null);
		case "task-todo":
			return evaluateTask(term.operand, ctx, caseOverride, "todo");
		case "task-done":
			return evaluateTask(term.operand, ctx, caseOverride, "done");
		default:
			return { matched: false, score: 0 };
	}
}

function evaluateTag(operand: QueryNode, ctx: EvalContext, caseOverride?: boolean): EvalResult {
	let best: EvalResult = { matched: false, score: 0 };
	for (const tag of ctx.file.tags) {
		const result = evaluateTextQueryOnText(operand, tag, caseOverride ?? ctx.caseSensitive);
		if (result.matched && result.score > best.score) best = result;
	}
	return best;
}

function evaluateLine(operand: QueryNode, ctx: EvalContext, caseOverride?: boolean): EvalResult {
	let best: EvalResult = { matched: false, score: 0 };
	for (const line of ctx.file.lines) {
		const result = evaluateTextQueryOnText(operand, line, caseOverride ?? ctx.caseSensitive);
		if (result.matched && result.score > best.score) best = result;
	}
	return best;
}

function evaluateBlock(operand: QueryNode, ctx: EvalContext, caseOverride?: boolean): EvalResult {
	let best: EvalResult = { matched: false, score: 0 };
	for (const block of ctx.group.blocks) {
		const result = evaluateTextQueryOnText(operand, block.searchText, caseOverride ?? ctx.caseSensitive);
		if (result.matched && result.score > best.score) best = result;
	}
	return best;
}

function evaluateSection(operand: QueryNode, ctx: EvalContext, caseOverride?: boolean): EvalResult {
	const sectionId = ctx.group.root.sectionId;
	const section = ctx.file.sections.find((s) => s.id === sectionId);
	if (!section) return { matched: false, score: 0 };
	return evaluateTextQueryOnText(operand, section.text, caseOverride ?? ctx.caseSensitive);
}

function evaluateTask(
	operand: QueryNode,
	ctx: EvalContext,
	caseOverride: boolean | undefined,
	status: "todo" | "done" | null
): EvalResult {
	let best: EvalResult = { matched: false, score: 0 };
	for (const block of ctx.group.blocks) {
		if (!block.isTask) continue;
		if (status && block.taskStatus !== status) continue;
		const result = evaluateTextQueryOnText(operand, block.searchText, caseOverride ?? ctx.caseSensitive);
		if (result.matched && result.score > best.score) best = result;
	}
	return best;
}

function evaluatePropertyTerm(term: PropertyTerm, ctx: EvalContext, caseOverride?: boolean): EvalResult {
	const frontmatter = ctx.file.frontmatter;
	if (!frontmatter) return { matched: false, score: 0 };

	const entries = Object.entries(frontmatter);
	const nameQuery = term.nameQuery;
	const caseSensitive = caseOverride ?? ctx.caseSensitive;

	let best: EvalResult = { matched: false, score: 0 };

	for (const [key, value] of entries) {
		if (nameQuery) {
			const nameMatch = evaluateTextQueryOnText(nameQuery, key, caseSensitive);
			if (!nameMatch.matched) continue;
		}

		if (!term.valueQuery && !term.nullCheck) {
			return { matched: true, score: 1 };
		}

		if (term.nullCheck) {
			const isEmpty = isEmptyValue(value);
			if (isEmpty) return { matched: true, score: 1 };
			continue;
		}

		const values = normalizeValues(value);
		for (const entry of values) {
			if (term.comparator) {
				const comparison = compareValues(entry, term.valueQuery, caseSensitive, term.comparator);
				if (comparison.matched) return comparison;
				continue;
			}

			if (term.valueQuery) {
				const result = evaluateTextQueryOnText(term.valueQuery, entry, caseSensitive);
				if (result.matched && result.score > best.score) best = result;
			}
		}
	}

	return best;
}

function compareValues(
	value: string,
	query: QueryNode | null,
	caseSensitive: boolean,
	comparator: "lt" | "gt"
): EvalResult {
	if (!query) return { matched: false, score: 0 };
	const target = stringifyQueryText(query);
	const leftNum = Number.parseFloat(value);
	const rightNum = Number.parseFloat(target);

	if (Number.isFinite(leftNum) && Number.isFinite(rightNum)) {
		const matched = comparator === "lt" ? leftNum < rightNum : leftNum > rightNum;
		return matched ? { matched: true, score: 1 } : { matched: false, score: 0 };
	}

	const left = caseSensitive ? value : value.toLowerCase();
	const right = caseSensitive ? target : target.toLowerCase();
	const matched = comparator === "lt" ? left < right : left > right;
	return matched ? { matched: true, score: 1 } : { matched: false, score: 0 };
}

function stringifyQueryText(node: QueryNode): string {
	if (node.type === "term" && node.term.kind === "text") return node.term.value;
	if (node.type === "and" && node.terms.length > 0) return stringifyQueryText(node.terms[0]!);
	if (node.type === "or" && node.terms.length > 0) return stringifyQueryText(node.terms[0]!);
	if (node.type === "not") return stringifyQueryText(node.term);
	return "";
}

function normalizeValues(value: unknown): string[] {
	if (value === null || value === undefined) return [];
	if (Array.isArray(value)) {
		return value.flatMap((entry) => normalizeValues(entry));
	}
	if (typeof value === "object") {
		return [JSON.stringify(value)];
	}
	return [String(value)];
}

function isEmptyValue(value: unknown): boolean {
	if (value === null || value === undefined) return true;
	if (Array.isArray(value)) return value.length === 0;
	if (typeof value === "string") return value.trim().length === 0;
	return false;
}

function evaluateTextQueryOnText(node: QueryNode, text: string, caseSensitive: boolean): EvalResult {
	switch (node.type) {
		case "and": {
			let total = 0;
			for (const term of node.terms) {
				const result = evaluateTextQueryOnText(term, text, caseSensitive);
				if (!result.matched) return { matched: false, score: 0 };
				total += result.score;
			}
			return { matched: true, score: total };
		}
		case "or": {
			let best: EvalResult = { matched: false, score: 0 };
			for (const term of node.terms) {
				const result = evaluateTextQueryOnText(term, text, caseSensitive);
				if (result.matched && result.score > best.score) best = result;
			}
			return best;
		}
		case "not": {
			const result = evaluateTextQueryOnText(node.term, text, caseSensitive);
			return result.matched ? { matched: false, score: 0 } : { matched: true, score: 0 };
		}
		case "term":
			if (node.term.kind !== "text") {
				return { matched: false, score: 0 };
			}
			return matchTextTerm(node.term, text, caseSensitive);
		default:
			return { matched: false, score: 0 };
	}
}

function matchTextTerm(term: TextTerm, text: string, caseSensitive: boolean): EvalResult {
	if (!term.value) return { matched: false, score: 0 };
	if (term.isRegex) {
		try {
			const flags = term.regexFlags ?? "";
			const regex = new RegExp(term.value, ensureGlobalFlag(caseSensitive ? flags : `${flags}i`));
			const matches = text.match(regex);
			return matches ? { matched: true, score: matches.length } : { matched: false, score: 0 };
		} catch {
			return { matched: false, score: 0 };
		}
	}

	const needle = caseSensitive ? term.value : term.value.toLowerCase();
	const haystack = caseSensitive ? text : text.toLowerCase();
	let count = 0;
	let idx = haystack.indexOf(needle);
	while (idx !== -1) {
		count++;
		idx = haystack.indexOf(needle, idx + needle.length);
	}
	return count > 0 ? { matched: true, score: count } : { matched: false, score: 0 };
}

function ensureGlobalFlag(flags: string): string {
	if (flags.includes("g")) return flags;
	return `${flags}g`;
}
