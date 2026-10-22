import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { CITIES } from "@/lib/graph";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

/** "CagayanDeOro" -> "Cagayan De Oro" — friendlier to read and to search. */
export function displayCityName(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

interface CityComboboxProps {
  value: string;
  onChange: (name: string) => void;
  disabled?: boolean;
  "aria-label": string;
}

/**
 * Searchable picker for the loaded province's town centers.
 */
export function CityCombobox({
  value,
  onChange,
  disabled,
  "aria-label": ariaLabel,
}: CityComboboxProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          disabled={disabled}
          className="w-full justify-between px-3 font-normal"
        >
          <span className="truncate">{displayCityName(value) || "Select Bohol"}</span>
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-56 p-0">
        <Command>
          <CommandInput placeholder="Search a Bohol town…" />
          <CommandList>
            <CommandEmpty>No town found.</CommandEmpty>
            <CommandGroup heading="Bohol">
              {CITIES.map((c) => (
                <CommandItem
                  key={c.name}
                  value={c.name}
                  keywords={[displayCityName(c.name)]}
                  onSelect={() => {
                    onChange(c.name);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-3.5 w-3.5",
                      value === c.name ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {displayCityName(c.name)}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
