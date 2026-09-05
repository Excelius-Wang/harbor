import { useId, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Field, FieldLabel } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DEFAULT_TRENDING_FILTERS,
  type GitHubTrendingFilters,
  type GitHubTrendingLanguage,
} from "./github-trending";

export function GitHubTrendingFilterControls({
  filters,
  languages,
  disabled,
  onChange,
}: {
  filters: GitHubTrendingFilters;
  languages: GitHubTrendingLanguage[];
  disabled: boolean;
  onChange: (filters: GitHubTrendingFilters) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const sponsorId = useId();
  const languageName =
    filters.language === "unknown"
      ? t("workspace.discovery.developers.unknownLanguage")
      : (languages.find((language) => language.slug === filters.language)?.name ??
        filters.language ??
        t("workspace.discovery.developers.allLanguages"));
  const selectLanguage = (language: string | null) => {
    onChange({ ...filters, language });
    setOpen(false);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            role="combobox"
            aria-expanded={open}
            aria-label={t("workspace.discovery.developers.language")}
            disabled={disabled}
            className="harbor-filter-trigger w-40 justify-between"
          >
            <span className="truncate">{languageName}</span>
            <ChevronDown data-icon="inline-end" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="harbor-popover harbor-filter-menu w-60 overflow-hidden rounded-[8px] p-0"
        >
          <Command label={t("workspace.discovery.developers.searchLanguages")}>
            <CommandInput
              aria-label={t("workspace.discovery.developers.searchLanguages")}
              placeholder={t("workspace.discovery.developers.searchLanguages")}
            />
            <CommandList>
              <CommandEmpty>{t("workspace.discovery.developers.noLanguages")}</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="all"
                  keywords={[t("workspace.discovery.developers.allLanguages")]}
                  onSelect={() => selectLanguage(null)}
                >
                  {t("workspace.discovery.developers.allLanguages")}
                  {!filters.language ? <Check className="ml-auto" /> : null}
                </CommandItem>
                {languages.map((language) => (
                  <CommandItem
                    key={language.slug}
                    value={language.slug}
                    keywords={
                      language.slug === "unknown"
                        ? [language.name, t("workspace.discovery.developers.unknownLanguage")]
                        : [language.name]
                    }
                    onSelect={() => selectLanguage(language.slug)}
                  >
                    <span className="truncate">
                      {language.slug === "unknown"
                        ? t("workspace.discovery.developers.unknownLanguage")
                        : language.name}
                    </span>
                    {filters.language === language.slug ? <Check className="ml-auto" /> : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <Field orientation="horizontal" className="w-auto gap-2">
        <Checkbox
          id={sponsorId}
          checked={filters.sponsorable}
          disabled={disabled}
          onCheckedChange={(checked) => onChange({ ...filters, sponsorable: checked === true })}
        />
        <FieldLabel htmlFor={sponsorId}>
          <span className="text-xs">{t("workspace.discovery.developers.sponsorable")}</span>
        </FieldLabel>
      </Field>
      {filters.language || filters.sponsorable ? (
        <Button
          variant="ghost"
          size="xs"
          disabled={disabled}
          onClick={() => onChange(DEFAULT_TRENDING_FILTERS)}
        >
          {t("workspace.discovery.developers.clearFilters")}
        </Button>
      ) : null}
    </>
  );
}
