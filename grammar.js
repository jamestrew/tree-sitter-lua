// TODO: Decide how to expose all the random characters that are used,
//          and how to easily highlight them if you want.
//

const PREC = {
  COMMA: -1,
  FUNCTION: 1,
  DEFAULT: 1,
  PRIORITY: 2,

  OR: 3, // => or
  AND: 4, // => and
  COMPARE: 5, // => < <= == ~= >= >
  BIT_OR: 6, // => |
  BIT_NOT: 7, // => ~
  BIT_AND: 8, // => &
  SHIFT: 9, // => << >>
  CONCAT: 10, // => ..
  PLUS: 11, // => + -
  MULTI: 12, // => * /             // %
  UNARY: 13, // => not # - ~
  POWER: 14, // => ^

  STATEMENT: 15,
  PROGRAM: 16,
};

EQUALS_LEVELS = 5;

module.exports = grammar({
  name: "lua",

  externals: ($) => [
    $._block_comment_start,
    $._block_comment_content,
    $._block_comment_end,

    $._string_start,
    $._string_content,
    $._string_end,
  ],

  extras: ($) => [
    // /[\n]/,
    /\s/,
    $.comment,
  ],

  inline: ($) => [
    $._expression,
    $._field_expression,
    $.field_separator,
    $.prefix_exp,

    $.function_impl,
    $.comment,
  ],

  conflicts: ($) => [
    [$.variable_declarator, $._prefix_exp],
    [$.doc_ignore, $.doc_comment],
  ],

  rules: {
    program: ($) =>
      prec(
        PREC.PROGRAM,
        seq(
          optional($.shebang),
          any_amount_of(
            choice(
              $._statement,
              $._documentation_brief_container,
              $.documentation_command,
              $._documentation_tag_container,
              $._documentation_config_container,
              $.documentation_class,
            ),
          ),
          optional(alias($.return_statement, $.module_return_statement)),
          optional("\0"),
        ),
      ),

    string: ($) =>
      seq(
        field("start", alias($._string_start, "string_start")),
        field("content", optional(alias($._string_content, "string_content"))),
        field("end", alias($._string_end, "string_end")),
      ),

    _statement: ($) =>
      prec.right(
        PREC.STATEMENT,
        seq(
          choice(
            $.assignment,
            $._declaration,
            $.function_call,
            $.do_statement,
            $.while_statement,
            $.repeat_statement,
            $.if_statement,
            $.for_statement,
            // $.comment
          ),
          optional(";"),
        ),
      ),

    shebang: (_) => /#![^\n]*/,

    _last_statement: ($) => choice($.return_statement, $.break_statement),

    _chunk: ($) =>
      choice(
        seq(one_or_more($._statement), optional($._last_statement)),
        $._last_statement,
      ),

    _block: ($) => $._chunk,

    _expression: ($) =>
      prec.left(
        choice(
          $.nil,
          $.boolean,
          $.number,
          $.string,
          $.ellipsis,
          $.function,
          $.prefix_exp,
          $.tableconstructor,
          $.binary_operation,
          $.unary_operation,
        ),
      ),

    // Primitives {{{
    nil: (_) => "nil",

    boolean: (_) => choice("true", "false"),

    number: ($) => {
      const decimal_digits = /[0-9]+/;
      const signed_integer = seq(optional(choice("-", "+")), decimal_digits);
      const decimal_exponent_part = seq(choice("e", "E"), signed_integer);

      const decimal_integer_literal = choice(
        "0",
        seq(optional("0"), /[1-9]/, optional(decimal_digits)),
      );

      const hex_digits = /[a-fA-F0-9]+/;
      const hex_exponent_part = seq(choice("p", "P"), signed_integer);

      const decimal_literal = choice(
        seq(
          decimal_integer_literal,
          ".",
          optional(decimal_digits),
          optional(decimal_exponent_part),
        ),
        seq(".", decimal_digits, optional(decimal_exponent_part)),
        seq(decimal_integer_literal, optional(decimal_exponent_part)),
      );

      const hex_literal = seq(
        choice("0x", "0X"),
        hex_digits,
        optional(seq(".", hex_digits)),
        optional(hex_exponent_part),
      );

      return token(choice(decimal_literal, hex_literal));
    },

    ellipsis: (_) => "...",

    function_name: ($) =>
      seq(
        list_of($.identifier, alias(".", $.table_dot), false),
        optional(seq(alias(":", $.table_colon), $.identifier)),
      ),

    function: ($) => seq($.function_start, $.function_impl),

    function_impl: ($) =>
      seq(
        alias($.left_paren, $.function_body_paren),
        optional($.parameter_list),
        alias($.right_paren, $.function_body_paren),
        alias(optional($._block), $.function_body),
        alias("end", $.function_end),
      ),

    parameter_list: ($) =>
      choice(
        seq(
          prec.left(PREC.COMMA, list_of($.identifier, /,\s*/, false)),
          optional(seq(/,\s*/, $.ellipsis)),
        ),
        $.ellipsis,
      ),
    // }}}

    _expression_list: ($) => list_of($._expression, ","),

    binary_operation: ($) =>
      choice(
        ...[
          ["or", PREC.OR],
          ["and", PREC.AND],
          ["<", PREC.COMPARE],
          ["<=", PREC.COMPARE],
          ["==", PREC.COMPARE],
          ["~=", PREC.COMPARE],
          [">=", PREC.COMPARE],
          [">", PREC.COMPARE],
          ["|", PREC.BIT_OR],
          ["~", PREC.BIT_NOT],
          ["&", PREC.BIT_AND],
          ["<<", PREC.SHIFT],
          [">>", PREC.SHIFT],
          ["+", PREC.PLUS],
          ["-", PREC.PLUS],
          ["*", PREC.MULTI],
          ["/", PREC.MULTI],
          ["//", PREC.MULTI],
          ["%", PREC.MULTI],
        ].map(([operator, precedence]) =>
          prec.left(precedence, seq($._expression, operator, $._expression)),
        ),
        ...[
          ["..", PREC.CONCAT],
          ["^", PREC.POWER],
        ].map(([operator, precedence]) =>
          prec.right(precedence, seq($._expression, operator, $._expression)),
        ),
      ),

    unary_operation: ($) =>
      prec.left(PREC.UNARY, seq(choice("not", "#", "-", "~"), $._expression)),

    local: (_) => "local",

    assignment: ($) =>
      seq(
        optional(field("documentation", $.lua_documentation)),
        list_of(field("name", $.variable_declarator), ",", false),
        "=",
        list_of(field("value", $._expression), ",", false),
      ),

    _declaration: ($) => choice($.variable_declaration, $.function_declaration),

    variable_declaration: ($) =>
      seq(
        optional(field("documentation", $.lua_documentation)),
        $.local,
        list_of(field("name", $.variable_declarator), ",", false),
        optional(seq("=", list_of(field("value", $._expression), ",", false))),
      ),

    function_declaration: ($) =>
      seq(
        optional(field("documentation", $.lua_documentation)),
        choice(
          seq(
            $.local,
            $.function_start,
            field("name", $.identifier),
          ),
          seq($.function_start, field("name", $.function_name)),
        ),
        $.function_impl,
      ),

    variable_declarator: ($) => $._var,

    // var ::=  identifier | prefixexp `[´ exp `]´ | prefixexp `.´ identifier
    _var: ($) =>
      prec(
        PREC.PRIORITY,
        choice(
          $.identifier,
          seq($.prefix_exp, "[", $._expression, "]"),
          seq($.prefix_exp, ".", $.identifier),
        ),
      ),

    var_list: ($) => list_of($._var, ",", false),

    _identifier_list: ($) =>
      prec.right(PREC.COMMA, list_of($.identifier, /,\s*/, false)),

    return_statement: ($) =>
      prec(PREC.PRIORITY, seq("return", optional(list_of($._expression, ",")))),

    break_statement: (_) => "break",

    // Blocks {{{
    do_statement: ($) =>
      seq(alias("do", $.do_start), optional($._block), alias("end", $.do_end)),

    while_statement: ($) =>
      seq(
        alias("while", $.while_start),
        $._expression,
        alias("do", $.while_do),
        optional($._block),
        alias("end", $.while_end),
      ),

    repeat_statement: ($) =>
      seq(
        alias("repeat", $.repeat_start),
        optional($._block),
        alias("until", $.repeat_until),
        $._expression,
      ),

    if_statement: ($) =>
      seq(
        alias("if", $.if_start),
        $._expression,
        alias("then", $.if_then),
        optional($._block),
        any_amount_of(
          seq(
            alias("elseif", $.if_elseif),
            $._expression,
            alias("then", $.if_then),
            optional($._block),
          ),
        ),
        optional(seq(alias("else", $.if_else), optional($._block))),
        alias("end", $.if_end),
      ),

    for_statement: ($) =>
      seq(
        alias("for", $.for_start),
        choice($.for_numeric, $.for_generic),
        alias("do", $.for_do),
        optional($._block),
        alias("end", $.for_end),
      ),

    for_numeric: ($) =>
      seq(
        field("var", $.identifier),
        "=",
        field("start", $._expression),
        ",",
        field("finish", $._expression),
        optional(seq(",", field("step", $._expression))),
      ),

    for_generic: ($) =>
      seq(
        field("identifier_list", alias($._identifier_list, $.identifier_list)),
        alias("in", $.for_in),
        field("expression_list", $._expression_list),
      ),

    function_start: () => "function",

    // }}}

    // Table {{{
    tableconstructor: ($) => seq("{", optional($.fieldlist), "}"),

    fieldlist: ($) =>
      prec(PREC.COMMA, list_of($.field, $.field_separator, true)),

    field: ($) => $._field_expression,

    // `[´ exp `]´ `=´ exp | identifier `=´ exp | exp
    _named_field_expression: ($) =>
      prec(
        PREC.PRIORITY,
        seq(field("name", $.identifier), "=", field("value", $._expression)),
      ),

    _expression_field_expression: ($) =>
      prec(
        PREC.PRIORITY,
        seq(
          // TODO: Decide if we really want to keep these...
          //          It will be useful when we want to highlight them
          //          in a particular color for people :)
          field(
            "field_left_bracket",
            alias($.left_bracket, $.field_left_bracket),
          ),
          field("key", $._expression),
          field(
            "field_right_bracket",
            alias($.right_bracket, $.field_right_bracket),
          ),
          "=",
          field("value", $._expression),
        ),
      ),

    _field_expression: ($) =>
      choice(
        $._expression_field_expression,
        $._named_field_expression,
        field("value", $._expression),
      ),

    field_separator: (_) => choice(",", ";"),
    // }}}

    // Function {{{
    _prefix_exp: ($) =>
      choice(
        $._var,
        $.function_call,
        seq($.left_paren, $._expression, $.right_paren),
      ),

    prefix_exp: ($) => $._prefix_exp,

    function_call: ($) =>
      prec.right(
        PREC.FUNCTION,
        seq(field("prefix", $.prefix_exp), choice($._args, $._self_call)),
      ),

    _args: ($) => choice($._parentheses_call, $._table_call, $._string_call),

    _parentheses_call: ($) =>
      seq(
        alias($.left_paren, $.function_call_paren),
        field("args", optional($.function_arguments)),
        alias($.right_paren, $.function_call_paren),
      ),

    _string_call: ($) =>
      field(
        "args",
        // TODO: Decide if this is really the name we want to use.
        alias($.string, $.string_argument),
      ),

    _table_call: ($) =>
      field("args", alias($.tableconstructor, $.table_argument)),

    _self_call: ($) =>
      seq(alias(":", $.self_call_colon), $.identifier, $._args),

    function_arguments: ($) =>
      seq($._expression, optional(repeat(seq(",", $._expression)))),

    // }}}

    _identifier: (_) => /[a-zA-Z_][a-zA-Z0-9_]*/,
    identifier: ($) => $._identifier,

    // Dummy Fields {{{
    left_paren: (_) => "(",
    right_paren: (_) => ")",

    left_bracket: (_) => "[",
    right_bracket: (_) => "]",

    _comma: (_) => ",",
    // }}}

    // Documentation {{{
    documentation_tag: () => /[^\n]*/,
    _documentation_tag_container: ($) =>
      prec.right(PREC.PROGRAM, seq(/\s*---@tag\s+/, $.documentation_tag)),

    documentation_config: ($) => $._expression,
    _documentation_config_container: ($) =>
      prec.right(PREC.PROGRAM, seq(/\s*---@config\s+/, $.documentation_config)),

    documentation_brief: () => /[^\n]*/,
    _documentation_brief_container: ($) =>
      prec.right(
        PREC.PROGRAM,
        seq(
          /@brief \[\[/,
          any_amount_of(/\s*---/, $.documentation_brief),
          /@brief \]\]/,
        ),
      ),

    documentation_command_content: ($) => /[^\n\[]*/,
    documentation_command: ($) =>
      prec.right(
        PREC.PROGRAM,
        seq(
          /@command/,
          field(
            "usage",
            alias($.documentation_command_content, $.documentation_usage),
          ),
          /\[\[/,
          repeat1(
            seq(
              /\s*---/,
              field("documentation", $.documentation_command_content),
            ),
          ),
          /@command \]\]/,
        ),
      ),

    doc_ignore: () => /\s*\n/,
    doc_comment: ($) => /[^@\n]*\n/,

    _doc_type: ($) =>
      prec.right(
        choice(
          $.doc_type_builtin,
          $.doc_identifier,
          alias($.string, $.doc_literal),
          $.doc_type_union,
          $.doc_type_optional,
          $._doc_type_paren,
          $.doc_type_array,
          $.doc_type_key_value,
          $.doc_type_table_literal,
          $.doc_type_function,
        ),
      ),

    doc_type_builtin: ($) =>
      prec.right(
        choice(
          "nil",
          "any",
          $._doc_type_bool,
          "string",
          "number",
          "integer",
          $._doc_type_func,
          "table",
          "thread",
          "userdata",
          "lightuserdata",
        ),
      ),

    _doc_identifier: ($) =>
      prec(PREC.PRIORITY, list_of($._identifier, ".", false)),

    doc_identifier: ($) =>
      choice(seq("`", $._doc_identifier, "`"), $._doc_identifier),

    _doc_type_bool: ($) => choice("boolean", "bool"),
    _doc_type_func: ($) => choice("function", "fun"),

    doc_type_union: ($) =>
      prec.right(PREC.PRIORITY, seq($._doc_type, "|", $._doc_type)),
    doc_type_optional: ($) => prec.right(PREC.PRIORITY, seq($._doc_type, "?")),
    _doc_type_paren: ($) => seq("(", $._doc_type, ")"),
    doc_type_array: ($) =>
      prec.right(PREC.PRIORITY, seq(field("type", $._doc_type), "[]")),

    doc_type_key_value: ($) =>
      seq(
        "table<",
        field("key", $._doc_type),
        ",",
        field("value", $._doc_type),
        ">",
      ),

    doc_type_table_literal: ($) =>
      seq("{", list_of($.doc_table_pair, ",", true), "}"),

    doc_table_pair: ($) =>
      seq(
        field(
          "key",
          choice(
            $.identifier,
            seq("[", choice($.string, $.number, $._doc_type), "]"),
          ),
        ),
        optional("?"),
        ":",
        field("value", $._doc_type),
      ),

    doc_type_function: ($) =>
      prec.right(
        PREC.FUNCTION,
        seq(
          $._doc_type_func,
          "(",
          optional(list_of($.doc_function_parameter, ",", false)),
          ")",
          optional($._doc_function_return),
        ),
      ),

    doc_function_parameter: ($) =>
      choice(
        seq(
          field("name", seq(choice($.identifier, $.ellipsis), optional("?"))),
          optional(seq(":", field("type", $._doc_type))),
        ),
      ),

    _doc_function_return: ($) =>
      seq(
        ":",
        choice(
          prec.right(list_of($.doc_function_return, ",", false)),
          seq("(", prec.right(list_of($.doc_function_return, ",", false)), ")"),
        ),
      ),

    doc_function_return: ($) =>
      prec.right(
        choice(
          field("type", $._doc_type),
          seq(
            field("name", seq($.identifier, optional("?"))),
            optional(seq(":", field("type", $._doc_type))),
          ),
        ),
      ),

    // Definition:
    // ---@class [(exact)] <name>[: <parent>]
    doc_class: ($) =>
      prec.left(
        seq(
          choice("@class", /--- *@class/),
          optional("(exact)"),
          field("name", $.doc_identifier),
          optional(seq(":", field("parent", $.doc_identifier))),
          any_amount_of($.doc_field),
        ),
      ),

    documentation_class: ($) =>
      prec.right(PREC.PROGRAM, $.doc_class),

    // Definition:
    // ---@field [public|protected|private] field_name MY_TYPE[|other_type] [@comment]
    //
    // I don't think [public|protected|private] is useful for us.
    //
    // ---@field example table hello
    // ---@field example (table): hello
    doc_field: ($) =>
      seq(
        choice("@field", /--- *@field/),
        optional(seq(field("visibility", $.doc_visibility), /\s+/)),
        field("name", $.identifier),
        optional("?"),
        /\s+/,
        field("type", $._doc_type),

        // TODO: How closely should we be to emmy...
        optional(seq(/\s*:\s*/, field("description", $.field_description))),
        /\n\s*/,
      ),

    doc_visibility: () => choice("public", "protected", "private"),

    // ---@generic <name> [:parent_type] [, <name> [:parent_type]]
    // generics are still wip https://github.com/LuaLS/lua-language-server/issues/1861
    doc_generic: ($) =>
      seq(
        "@generic",
        list_of(
          seq(
            field("name", $.identifier),
            optional(field("type", seq(":", field("parent", $._doc_type)))),
          ),
          ",",
          false,
        ),
      ),

    // Definition:
    // ---@param <name[?]> <type[|type...]> [description]
    doc_parameter: ($) =>
      prec.right(
        PREC.PRIORITY,
        seq(
          /@param\s+/,
          field(
            "name",
            choice($.identifier, $.optional_identifier, $.ellipsis),
          ),
          field("type", $._doc_type),
          optional(
            seq(
              token.immediate(choice(" ", ":")),
              field("description", $.parameter_description),
            ),
          ),
          any_amount_of($.doc_parameter_enum),
        ),
      ),

    optional_identifier: ($) => seq($._identifier, "?"),
    parameter_description: ($) => /[^\n]+/,

    doc_parameter_enum: ($) =>
      seq(
        / *--- *\|/,
        field("type", $._doc_type),
        optional(seq("#", field("description", $.parameter_description))),
      ),

    _multiline_doc_string: ($) =>
      prec.right(PREC.PRIORITY, seq(/[^\n]+/, any_amount_of(/\s*---[^@\n]*/))),

    class_description: ($) => $._multiline_doc_string,
    field_description: ($) => $._multiline_doc_string,

    doc_return_description: ($) => $._multiline_doc_string,

    // ---@return <type> [<name> [comment] | [name] #<comment>]
    doc_return: ($) =>
      prec.right(
        seq(
          "@return",
          field("type", $._doc_type),
          optional(
            choice(
              seq(
                field("name", $.identifier),
                optional(
                  seq(" ", field("description", $.doc_return_description)),
                ),
              ),
              seq(
                choice(":", "#"),
                field("description", $.doc_return_description),
              ),
            ),
          ),
        ),
      ),

    doc_eval: ($) => $._expression,
    _doc_eval_container: ($) => seq(/@eval\s+/, $.doc_eval),

    doc_typedecl: ($) => seq(/@type/, list_of($._doc_type, ",", false)),
    doc_note: (_) => seq(/@note.+/, /[^\n]*/),
    doc_see: (_) => seq(/@see.+/, /[^\n]*/),
    doc_todo: (_) => seq(/@todo.+/, /[^\n]*/),
    doc_usage: (_) => seq(/@usage.+/, /[^\n]*/),
    doc_varargs: (_) => seq(/@varargs.+/, /[^\n]*/),

    lua_documentation: ($) =>
      one_or_more(
        seq(
          "---",
          choice(
            $.doc_comment,
            $.doc_ignore,
            $._doc_eval_container,
            $.doc_class,
            $.doc_field,
            $.doc_generic,
            $.doc_parameter,
            $.doc_typedecl,
            $.doc_note,
            $.doc_see,
            $.doc_todo,
            $.doc_usage,
            $.doc_varargs,
            $.doc_return,
          ),
        ),
      ),
    // }}}

    // Comments {{{
    // comment: ($) => choice(seq("--", /[^-].*\r?\n/), $._multi_comment),
    comment: ($) =>
      choice(
        seq(
          field("start", alias("--", "comment_start")),
          field("content", alias(/[^\r\n]*/, "comment_content")),
        ),
        seq(
          field("start", alias($._block_comment_start, "comment_start")),
          field(
            "content",
            optional(alias($._block_comment_content, "comment_content")),
          ),
          field("end", alias($._block_comment_end, "comment_end")),
        ),
      ),
    // }}}
  },
});

function any_amount_of() {
  return repeat(seq(...arguments));
}

function one_or_more() {
  return repeat1(seq(...arguments));
}

function list_of(match, sep, trailing) {
  return trailing
    ? seq(match, any_amount_of(sep, match), optional(sep))
    : seq(match, any_amount_of(sep, match));
}

/*
   ambient_declaration: $ => seq(
        'declare',
        choice(
          $._declaration,
          seq('global', $.statement_block),
          seq('module', '.', alias($.identifier, $.property_identifier), ':', $._type)
        )
      ),

    member_expression: $ => prec(PREC.MEMBER, seq(
      field('object', choice($._expression, $._primary_expression)),
      choice('.', '?.'),
      field('property', alias($.identifier, $.property_identifier))
    )),

    */
