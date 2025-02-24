import { NextResponse } from "next/server";
import { Message } from "@/lib/types";
import { planOperation } from "@/lib/agents/vercel/orchestrator";
import { executeOperation } from "@/lib/agents/vercel/workers";
import { evaluateResponse } from "@/lib/agents/vercel/evaluator";
import { createTodo, updateTodo, deleteTodo, listTodos } from "@/lib/db";
import { trackInteraction } from "@/lib/metrics";

export async function POST(req: Request) {
  try {
    const startTime = Date.now();
    const { message, agentType, messages = [] } = await req.json();

    // Create user message
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: message,
      timestamp: new Date(),
      metadata: {
        activeAgent: agentType,
      },
    };

    // Add user message to context
    const chatContext = [...messages, userMessage];

    // Step 1: Plan the operation using orchestrator
    const operationPlan = await planOperation(message, chatContext);
    if (!operationPlan.success) {
      throw new Error(operationPlan.error);
    }

    console.log("Operation plan:", {
      intent: operationPlan.intent,
      operation: operationPlan.plan.operation,
      complexity: operationPlan.plan.complexity,
      tools: operationPlan.plan.requiredTools,
      matchedTask: operationPlan.matchedTask,
    });

    // Step 2: Execute the operation using appropriate worker
    const execution = await executeOperation(
      operationPlan.plan.operation,
      operationPlan.plan.context,
      message,
      chatContext
    );
    if (!execution.success || !execution.action) {
      throw new Error(execution.error || "No action generated");
    }

    // Step 3: Execute the database operation
    let todoIds: string[] = [];
    let error: string | undefined;
    let matchedContent: string | undefined;
    let todoSuccess = 0;
    let todoFailed = 0;

    try {
      const args = execution.action.arguments;

      // If we have a matched todo by content, use it in the response
      if (
        operationPlan.plan.context?.matchedTodo &&
        (execution.action.name === "completeTodo" ||
          execution.action.name === "updateTodo")
      ) {
        matchedContent = operationPlan.plan.context.matchedTodo.content;
      }

      switch (execution.action.name) {
        case "createTodo": {
          const result = await createTodo({
            content: args.content,
            agentType,
            createdBy: "agent",
            priority: args.priority,
            labels: args.labels,
            complexity: args.complexity,
          });
          if (result.success && result.todo) {
            todoIds.push(result.todo.id);
            todoSuccess++;
          } else {
            error = "Failed to create todo";
            todoFailed++;
          }
          break;
        }
        case "updateTodo": {
          const result = await updateTodo({
            id: args.id,
            content: args.content,
            completed: args.completed,
            priority: args.priority,
            labels: args.labels,
            complexity: args.complexity,
          });
          if (result.success && result.todo) {
            todoIds.push(result.todo.id);
            todoSuccess++;
          } else {
            error = result.error?.toString() || "Failed to update todo";
            todoFailed++;
          }
          break;
        }
        case "completeTodo": {
          const result = await updateTodo({
            id: args.id,
            completed: args.completed,
          });
          if (result.success && result.todo) {
            todoIds.push(result.todo.id);
            todoSuccess++;
          } else {
            error =
              result.error?.toString() ||
              "Failed to update todo completion status";
            todoFailed++;
          }
          break;
        }
        case "deleteTodo": {
          const result = await deleteTodo(args.id);
          if (result.success) {
            todoIds.push(args.id);
            todoSuccess++;
          } else {
            error = result.error?.toString() || "Failed to delete todo";
            todoFailed++;
          }
          break;
        }
        case "listTodos": {
          const result = await listTodos({
            agentType,
            completed: args.completed,
            priority: args.priority,
            labels: args.labels,
          });
          if (result.success && result.todos) {
            todoIds = result.todos.map((todo) => todo.id);
            todoSuccess++;
          } else {
            error = "Failed to list todos";
            todoFailed++;
          }
          break;
        }
        default:
          error = `Unknown action: ${execution.action.name}`;
          todoFailed++;
      }
    } catch (err) {
      console.error("Error executing database operation:", err);
      error = err instanceof Error ? err.message : "Database operation failed";
      todoFailed++;
    }

    // Step 4: Evaluate and optimize the response
    const responseEvaluation = await evaluateResponse(
      message,
      execution.explanation ?? "",
      chatContext
    );

    // Calculate total response time
    const responseTime = Date.now() - startTime;

    // Create assistant message
    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: responseEvaluation.success
        ? responseEvaluation.finalResponse
        : (execution.explanation ?? ""),
      timestamp: new Date(),
      metadata: {
        activeAgent: agentType,
        toolCalls: [
          {
            id: crypto.randomUUID(),
            type: "function",
            name: execution.action.name,
            arguments: JSON.stringify(execution.action.arguments),
            error: error,
          },
        ],
        todoIds,
        error,
        matchedTask: operationPlan.matchedTask,
        matchedContent,
        plan: {
          ...operationPlan.plan,
          intent: operationPlan.intent,
        },
        evaluation: responseEvaluation.success
          ? responseEvaluation.evaluation
          : undefined,
      },
    };

    // Track this interaction
    await trackInteraction(agentType, message, assistantMessage, {
      responseTime,
      success: !error,
      todoSuccessCount: todoSuccess,
      todoFailCount: todoFailed,
      // We don't have token usage data yet
      tokenUsage: undefined,
    });

    return NextResponse.json({
      success: true,
      message: assistantMessage,
    });
  } catch (error) {
    console.error("Error in chat endpoint:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to process message",
      },
      { status: 500 }
    );
  }
}
