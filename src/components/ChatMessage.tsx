import { Card } from "@/components/ui/card";
import { Bot, User } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  isLoading?: boolean;
}

const ChatMessage = ({ role, content, isLoading }: ChatMessageProps) => {
  const isBot = role === "assistant";

  return (
    <div className={cn("flex gap-3", isBot ? "justify-start" : "justify-end")}>
      {isBot && (
        <div className="w-8 h-8 rounded-full bg-gradient-accent flex items-center justify-center flex-shrink-0 shadow-glow">
          <Bot className="w-5 h-5" />
        </div>
      )}
      <Card
        className={cn(
          "max-w-[80%] p-4 transition-all",
          isBot
            ? "bg-gradient-card backdrop-blur-xl border-border/50"
            : "bg-primary text-primary-foreground shadow-glow border-primary"
        )}
      >
        <div className="text-sm leading-relaxed">
          {isLoading ? (
            <span className="inline-flex gap-1">
              <span className="animate-pulse">●</span>
              <span className="animate-pulse delay-100">●</span>
              <span className="animate-pulse delay-200">●</span>
            </span>
          ) : isBot ? (
            <ReactMarkdown
              components={{
                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                ul: ({ children }) => <ul className="list-disc ml-4 mb-2 space-y-1">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal ml-4 mb-2 space-y-1">{children}</ol>,
                li: ({ children }) => <li>{children}</li>,
                strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                h1: ({ children }) => <h1 className="text-lg font-bold mb-2">{children}</h1>,
                h2: ({ children }) => <h2 className="text-base font-bold mb-2">{children}</h2>,
                h3: ({ children }) => <h3 className="text-sm font-bold mb-2">{children}</h3>,
              }}
            >
              {content}
            </ReactMarkdown>
          ) : (
            <p className="whitespace-pre-wrap">{content}</p>
          )}
        </div>
      </Card>
      {!isBot && (
        <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
          <User className="w-5 h-5" />
        </div>
      )}
    </div>
  );
};

export default ChatMessage;
