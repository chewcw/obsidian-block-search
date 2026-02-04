export type QueryNode =
	| { type: "and"; terms: QueryNode[] }
	| { type: "or"; terms: QueryNode[] }
	| { type: "not"; term: QueryNode }
	| { type: "term"; term: QueryTerm };

export type QueryTerm =
	| TextTerm
	| OperatorTerm
	| PropertyTerm;

export interface TextTerm {
	kind: "text";
	value: string;
	isPhrase: boolean;
	isRegex: boolean;
	regexFlags: string | null;
}

export interface OperatorTerm {
	kind: "operator";
	operator: OperatorName;
	operand: QueryNode;
}

export interface PropertyTerm {
	kind: "property";
	nameQuery: QueryNode | null;
	valueQuery: QueryNode | null;
	comparator: "lt" | "gt" | null;
	nullCheck: boolean;
}

export type OperatorName =
	| "file"
	| "path"
	| "content"
	| "match-case"
	| "ignore-case"
	| "tag"
	| "line"
	| "block"
	| "section"
	| "task"
	| "task-todo"
	| "task-done";

export const OPERATORS: OperatorName[] = [
	"file",
	"path",
	"content",
	"match-case",
	"ignore-case",
	"tag",
	"line",
	"block",
	"section",
	"task",
	"task-todo",
	"task-done",
];
