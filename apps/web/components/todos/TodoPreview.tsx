import { Todo } from "@/lib/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { Badge } from "@workspace/ui/components/badge";
import { CheckCircle2, Circle } from "lucide-react";
import { Button } from "@workspace/ui/components/button";

interface TodoPreviewProps {
  todo: Todo;
  isNew?: boolean;
  onToggleComplete?: (id: string, completed: boolean) => void;
}

export function TodoPreview({
  todo,
  isNew,
  onToggleComplete,
}: TodoPreviewProps) {
  return (
    <Card className={isNew ? "border-primary" : undefined}>
      {isNew && (
        <div className="absolute -top-2 -right-2">
          <Badge variant="default">New</Badge>
        </div>
      )}
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="p-0 h-auto hover:bg-transparent"
            onClick={() => onToggleComplete?.(todo.id, !todo.completed)}
          >
            {todo.completed ? (
              <CheckCircle2 className="w-4 h-4 text-primary" />
            ) : (
              <Circle className="w-4 h-4 text-muted-foreground hover:text-primary transition-colors" />
            )}
          </Button>
          <span
            className={
              todo.completed ? "line-through text-muted-foreground" : ""
            }
          >
            {todo.content}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {todo.priority > 0 && (
            <Badge variant="secondary">Priority {todo.priority}</Badge>
          )}
          {todo.labels?.map((label) => (
            <Badge key={label} variant="outline">
              {label}
            </Badge>
          ))}
          {/* {todo.complexity > 0 && (
            <Badge variant="secondary">
              Complexity: {Math.round(todo.complexity * 100)}%
            </Badge>
          )} */}
        </div>
      </CardContent>
    </Card>
  );
}
