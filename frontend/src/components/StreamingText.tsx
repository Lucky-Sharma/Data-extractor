interface Props {
  text: string;
  isStreaming: boolean;
}


export function StreamingText({ text, isStreaming }: Props) {
  return (
    <span className="whitespace-pre-wrap leading-relaxed">
      {text}
      {isStreaming && text && (
        <span
          className="cursor-blink inline-block w-0.5 h-[1em] bg-current ml-0.5 align-middle opacity-80"
          aria-hidden="true"
        />
      )}
    </span>
  );
}
